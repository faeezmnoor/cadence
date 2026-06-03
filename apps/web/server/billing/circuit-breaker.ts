/**
 * CAD-102 (T4) — Pro tier cost-overrun circuit breaker.
 *
 * The Pro tier costs us ~$0.25–0.40 cost-to-us per brief and bills 3
 * credits. A misconfiguration (a sky-high keyword set + a small alpha
 * cohort hammering /sample) could burn through a meaningful share of
 * monthly margin in an afternoon — this is a side-INCOME generator,
 * not a venture-funded experiment. The circuit breaker caps daily Pro
 * spend so a runaway can't drain runway while Faeez is asleep.
 *
 * What it does:
 *   - Sums today's (UTC) cost_events.cost_usd attributable to Pro
 *     briefs. "Attributable to Pro" = the cost_events row references
 *     a digest_runs row whose metadata.tier.resolved = "pro".
 *   - Returns ok=false when that total exceeds PRO_TIER_DAILY_USD_CAP
 *     (default $20 USD).
 *
 * What the caller does (in digest/run.ts):
 *   - BEFORE invoking the Pro composer, calls isProTierCostSane(). If
 *     not ok, downgrades to default and stamps runMetadata.fallback =
 *     { reason: "cost_cap" }.
 *   - Sentry-alerts ONCE per UTC day so we know to investigate, but
 *     doesn't page on every dispatch after the cap trips.
 *
 * Why a UTC daily window: matches digest_runs.run_date and is the
 * smallest window that lets us reset automatically without a cron.
 * Per-hour would be tighter but resets too often to be meaningful;
 * per-month is too lenient for early alpha.
 *
 * Why query cost_events not transactions.cost_to_us_micro_usd: the
 * latter only records *delivered* briefs, but the circuit breaker
 * needs to count cost spent on briefs that failed too (the most
 * likely runaway scenario is repeated Pro composer failures incurring
 * full per-call cost). cost_events fires on every LLM/search call
 * regardless of downstream success.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { costEvents, digestRuns } from "@/server/db/schema";

/**
 * Daily USD cap for Pro tier cost-to-us. Override via env in prod if we
 * want to raise the ceiling for a planned campaign.
 *
 * 20 USD/day ≈ 50–80 Pro briefs/day at current cost-to-us. Well above
 * alpha cohort's expected volume (<10/day) so we trip ONLY on runaways.
 */
export const DEFAULT_PRO_DAILY_USD_CAP = 20;

function dailyUsdCap(): number {
  const raw = process.env.PRO_TIER_DAILY_USD_CAP;
  if (!raw) return DEFAULT_PRO_DAILY_USD_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PRO_DAILY_USD_CAP;
  return parsed;
}

export interface ProTierCostSanityResult {
  ok: boolean;
  /** Total cost_events USD attributed to Pro today (UTC). */
  usdToday: number;
  /** The cap that was applied; helpful for the Sentry context payload. */
  capUsd: number;
  /** Set iff ok=false; human-readable reason. */
  reason?: string;
}

/**
 * Sums today's Pro cost_events.cost_usd, returns ok=false if over cap.
 *
 * Day boundary is UTC midnight — matches the rest of the pipeline's
 * day semantics (digest_runs.run_date is UTC).
 */
export async function isProTierCostSane(): Promise<ProTierCostSanityResult> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  // Join cost_events → digest_runs and filter on metadata.tier.resolved.
  // Using jsonb operator #>> '{tier,resolved}' lets PG use a btree on the
  // jsonb expression if we ever add one; for now the WHERE digest_run_id
  // IS NOT NULL + created_at >= today predicates are highly selective.
  const rows = await db
    .select({
      sumUsd: sql<string | null>`COALESCE(SUM(${costEvents.costUsd}), 0)`,
    })
    .from(costEvents)
    .innerJoin(digestRuns, eq(digestRuns.id, costEvents.digestRunId))
    .where(
      and(
        gte(costEvents.createdAt, startOfDayUtc),
        sql`${digestRuns.metadata} #>> '{tier,resolved}' = 'pro'`
      )
    );

  const usdToday = Number(rows[0]?.sumUsd ?? 0);
  const capUsd = dailyUsdCap();
  if (usdToday > capUsd) {
    return {
      ok: false,
      usdToday,
      capUsd,
      reason: `pro_tier_daily_cap_exceeded: $${usdToday.toFixed(2)} > $${capUsd.toFixed(2)}`,
    };
  }
  return { ok: true, usdToday, capUsd };
}

/**
 * Compute the trip threshold by summing the supplied (usd, tier) tuples.
 *
 * Exposed as a pure helper so unit tests can lock the boundary semantics
 * (> cap trips, == cap does NOT trip, < cap passes) without touching the
 * database. Mirrors the inequality used in isProTierCostSane.
 */
export function evaluateProCostSanity(
  proUsdToday: number,
  capUsd: number = DEFAULT_PRO_DAILY_USD_CAP
): ProTierCostSanityResult {
  if (proUsdToday > capUsd) {
    return {
      ok: false,
      usdToday: proUsdToday,
      capUsd,
      reason: `pro_tier_daily_cap_exceeded: $${proUsdToday.toFixed(2)} > $${capUsd.toFixed(2)}`,
    };
  }
  return { ok: true, usdToday: proUsdToday, capUsd };
}
