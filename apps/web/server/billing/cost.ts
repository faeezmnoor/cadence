/**
 * T-512a: Per-brief cost-to-us estimation + persistence helpers.
 *
 * Two columns we maintain (PRD §3.1, §3.2):
 *   - users.cost_to_us_micro_usd: lifetime SUM of cost-to-us in micro-USD.
 *   - transactions.cost_to_us_micro_usd: snapshot of THIS brief's cost
 *     on the corresponding `type='charge'` row.
 *
 * The substrate for estimation is the existing `cost_events` table (one row
 * per LLM call / search hit). For each delivered digest_run we sum the
 * cost_events rows attached to that run, convert USD → micro-USD, and:
 *   - write the snapshot onto the transactions row (T-505a does this),
 *   - add the snapshot into users.cost_to_us_micro_usd.
 *
 * "Bill-to-user" vs "cost-to-us" — two columns, kept separate by design:
 *   - bill-to-user = `transactions.credits_delta` × pack-pricing snapshot
 *     (what we charged). Always −1 credit for charge rows.
 *   - cost-to-us  = `transactions.cost_to_us_micro_usd` (what we paid
 *     LLM/search providers for that specific brief).
 *
 * The fallback `FALLBACK_COST_MICRO` exists so a brief delivered before
 * cost_events lands (or where the LLM call's metadata is missing) still
 * gets a non-zero cost-to-us number — under-counting hides margin from the
 * side-income lens (locked principle).
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { costEvents } from "@/server/db/schema";
import { COST_TO_US_MICRO_PER_CREDIT_V1 } from "./packs";

/** Conversion: 1 USD = 1_000_000 micro-USD. */
export const USD_TO_MICRO = 1_000_000;

/**
 * CAD-89: per-brief credit cost by tier.
 *
 * Pro briefs cost 3 credits to reflect the higher COGS (Sonar Reasoning
 * Pro search + Sonnet 4.6 composer vs Haiku + Brave). Default stays at 1.
 *
 * Single source of truth — every debit + refund path MUST read through
 * here so the multiplier can never drift between charge and reversal.
 *
 * The multiplier (3) is the PRD-locked Phase 5.1 number; revisit only after
 * eval data shows actual cost ratio is materially different.
 */
export type Tier = "default" | "pro";

export function creditCostForTier(tier: Tier | string | null | undefined): number {
  return tier === "pro" ? 3 : 1;
}

/**
 * Fallback cost-to-us if we have NO cost_events for a run. Mirrors the
 * pricing_snapshots COGS estimate so audits stay internally consistent
 * even when telemetry is missing.
 */
export const FALLBACK_COST_MICRO = COST_TO_US_MICRO_PER_CREDIT_V1;

/**
 * USD (float) → micro-USD (integer), rounded.
 * Guards against negative or NaN floats — those become 0 micro-USD
 * (we'd rather record a cost-to-us of 0 than crash the debit path).
 */
export function usdToMicroUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * USD_TO_MICRO);
}

/**
 * Sum cost_events.cost_usd for a digest_run, converted to micro-USD.
 *
 * If no rows exist (race: charge write fires before cost_events write
 * commits, or this is a legacy run), returns FALLBACK_COST_MICRO so
 * we never debit users.cost_to_us_micro_usd by 0 silently.
 *
 * Returns:
 *   { micros, eventCount, usedFallback }
 *   - micros: micro-USD to attribute to this brief
 *   - eventCount: how many cost_events rows we summed (0 = fallback)
 *   - usedFallback: true iff we returned FALLBACK_COST_MICRO
 */
export async function costToUsMicroUsdForRun(
  digestRunId: string
): Promise<{ micros: number; eventCount: number; usedFallback: boolean }> {
  const rows = await db
    .select({
      sumUsd: sql<string | null>`COALESCE(SUM(${costEvents.costUsd}), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(costEvents)
    .where(eq(costEvents.digestRunId, digestRunId));

  const eventCount = rows[0]?.count ?? 0;
  if (eventCount === 0) {
    return { micros: FALLBACK_COST_MICRO, eventCount: 0, usedFallback: true };
  }
  const sumUsd = Number(rows[0]?.sumUsd ?? 0);
  const micros = usdToMicroUsd(sumUsd);
  // Even when cost_events exist, never go below the fallback floor —
  // a $0.0000-cost row probably means a free/cached call, not free delivery.
  if (micros <= 0) {
    return { micros: FALLBACK_COST_MICRO, eventCount, usedFallback: true };
  }
  return { micros, eventCount, usedFallback: false };
}
