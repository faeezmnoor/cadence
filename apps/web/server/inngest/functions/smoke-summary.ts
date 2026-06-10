/**
 * T-306 (CAD-41): daily smoke spec observability summary.
 *
 * Runs once per day at 01:00 UTC (09:00 MYT). For every digest_spec with
 * `is_smoke=true`, summarises the last 24h of digest_runs and posts a
 * structured status block to Telegram + logs.
 *
 * Why this exists:
 *   We need empirical proof that Phase 3 infra (tz cron + idempotency +
 *   retry + auto-heal) works without intervention. 3 consecutive clean
 *   daily summaries = the delivery layer is trustworthy enough to
 *   onboard the first real users.
 *
 * Output contract (per smoke spec, one block):
 *   - expected: number of runs the cron should have claimed in the last
 *     24h (1 for daily cadence — daily IS the only Phase 3 cadence)
 *   - actual: number of digest_runs rows with delivery_minute_utc in the
 *     last 24h for this spec
 *   - delivered: subset of actual with status='delivered'
 *   - failed: subset of actual with status='failed'
 *   - retried: rows with attempt_count > 1
 *   - broken: user.state = 'delivery_broken' at summary time
 *   - last_error: the most recent non-null last_error across the window
 *   - latency_p50_ms / latency_p99_ms: created_at -> updated_at (proxy for
 *     delivered_at since we don't have a dedicated delivered_at column)
 *     for delivered rows
 *
 * Alert criteria (emoji-prefixed status line):
 *   "[OK]" if expected == actual AND broken == false AND no row had
 *      attempt_count > 2
 *   "[ALERT]" otherwise
 *
 * Telegram delivery target:
 *   The smoke spec OWNER's telegram_chat_id (so Faeez gets pinged on his
 *   own chat — same number that receives the smoke briefs themselves).
 *   If unset, the function still completes + logs, but does not crash.
 *
 * Kill switch:
 *   Toggle `is_smoke=false` on the spec. The summary then ignores it.
 *   See docs/SMOKE.md.
 */
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import {
  telegramAdapter,
  formatPlainText,
  isTelegramConfigured,
} from "@/server/channels/telegram";

const SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SmokeSpecSummary {
  smokeSpecId: string;
  ownerEmail: string;
  ownerState: string;
  telegramChatId: number | null;
  expected: number;
  actual: number;
  delivered: number;
  failed: number;
  pending: number;
  retried: number;
  broken: boolean;
  lastError: string | null;
  latencyP50Ms: number | null;
  latencyP99Ms: number | null;
  ok: boolean;
}

export interface SmokeSummaryOutput {
  windowEndIso: string;
  windowStartIso: string;
  specsScanned: number;
  perSpec: SmokeSpecSummary[];
  telegramSent: boolean;
}

/**
 * Daily-cadence expected count over a 24h window. Hardcoded to 1 — we only
 * support `daily` smoke specs in Phase 3. Weekly/monthly smoke specs would
 * need bespoke expectation logic; not worth it until we ship those cadences
 * to real users.
 */
const EXPECTED_RUNS_PER_DAY = 1;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx] ?? null;
}

/**
 * Build the per-spec summary for one smoke spec id. Exported so the test
 * suite can drive it without spinning up Inngest.
 */
export async function summariseSmokeSpec(
  smokeSpecId: string,
  windowStart: Date,
  database = db
): Promise<SmokeSpecSummary> {
  const [specRow] = await database
    .select({
      specId: digestSpecs.id,
      userId: users.id,
      ownerEmail: users.email,
      ownerState: users.state,
      telegramChatId: users.telegramChatId,
    })
    .from(digestSpecs)
    .innerJoin(users, eq(digestSpecs.userId, users.id))
    .where(eq(digestSpecs.id, smokeSpecId))
    .limit(1);

  if (!specRow) {
    throw new Error(`smoke spec not found: ${smokeSpecId}`);
  }

  const runs = await database
    .select({
      id: digestRuns.id,
      status: digestRuns.status,
      attemptCount: digestRuns.attemptCount,
      lastError: digestRuns.lastError,
      createdAt: digestRuns.createdAt,
      updatedAt: digestRuns.updatedAt,
    })
    .from(digestRuns)
    .where(
      and(
        eq(digestRuns.specId, smokeSpecId),
        isNotNull(digestRuns.deliveryMinuteUtc),
        gte(digestRuns.deliveryMinuteUtc, windowStart)
      )
    )
    .orderBy(desc(digestRuns.createdAt));

  const delivered = runs.filter((r) => r.status === "delivered");
  const failed = runs.filter((r) => r.status === "failed");
  const pending = runs.filter((r) => r.status === "pending" || r.status === "composing");
  const retried = runs.filter((r) => (r.attemptCount ?? 0) > 1);

  const latencies = delivered
    .map((r) => {
      if (!r.createdAt || !r.updatedAt) return null;
      return new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime();
    })
    .filter((x): x is number => x !== null && x >= 0)
    .sort((a, b) => a - b);

  const broken = specRow.ownerState === "delivery_broken";
  const ok =
    runs.length === EXPECTED_RUNS_PER_DAY &&
    !broken &&
    !runs.some((r) => (r.attemptCount ?? 0) > 2);

  const lastErrorRow = runs.find((r) => r.lastError);

  return {
    smokeSpecId,
    ownerEmail: specRow.ownerEmail,
    ownerState: specRow.ownerState,
    telegramChatId: specRow.telegramChatId,
    expected: EXPECTED_RUNS_PER_DAY,
    actual: runs.length,
    delivered: delivered.length,
    failed: failed.length,
    pending: pending.length,
    retried: retried.length,
    broken,
    lastError: lastErrorRow?.lastError ?? null,
    latencyP50Ms: percentile(latencies, 50),
    latencyP99Ms: percentile(latencies, 99),
    ok,
  };
}

/**
 * Render a Telegram-friendly plain-text block. No markdown asterisks (per
 * smoke contract — easier to read on small screens, no escape headaches).
 */
export function formatSmokeSummary(out: SmokeSummaryOutput): string {
  const lines: string[] = [];
  lines.push("Cadence smoke summary");
  lines.push(`window: ${out.windowStartIso} -> ${out.windowEndIso} (UTC)`);
  lines.push(`smoke specs: ${out.specsScanned}`);
  if (out.specsScanned === 0) {
    lines.push("(no smoke specs found — kill switch flipped or not seeded)");
    return lines.join("\n");
  }
  for (const s of out.perSpec) {
    lines.push("");
    lines.push(s.ok ? "[OK] " + s.ownerEmail : "[ALERT] " + s.ownerEmail);
    lines.push(`  spec: ${s.smokeSpecId}`);
    lines.push(`  runs: ${s.actual}/${s.expected} expected`);
    lines.push(
      `  delivered=${s.delivered} failed=${s.failed} pending=${s.pending} retried=${s.retried}`
    );
    lines.push(`  user.state: ${s.ownerState}${s.broken ? " (BROKEN)" : ""}`);
    if (s.latencyP50Ms !== null) {
      lines.push(`  latency: p50=${s.latencyP50Ms}ms p99=${s.latencyP99Ms}ms`);
    }
    if (s.lastError) {
      const trimmed = s.lastError.length > 160 ? s.lastError.slice(0, 157) + "..." : s.lastError;
      lines.push(`  last_error: ${trimmed}`);
    }
  }
  return lines.join("\n");
}

export const smokeSummary = inngest.createFunction(
  {
    id: "smoke-summary",
    name: "Smoke spec daily summary (T-306)",
    concurrency: { limit: 1 },
    triggers: [
      // 01:00 UTC = 09:00 MYT. After Faeez's 07:00 MYT live-commerce brief
      // AND after the 06:30 MYT smoke delivery slot, so the summary always
      // includes today's smoke run.
      { cron: "0 1 * * *" },
    ],
  },
  async ({ step, logger }) => {
    const output = await step.run("compute-summary", async (): Promise<SmokeSummaryOutput> => {
      const windowEnd = new Date();
      const windowStart = new Date(windowEnd.getTime() - SUMMARY_WINDOW_MS);

      const specs = await db
        .select({ id: digestSpecs.id })
        .from(digestSpecs)
        .where(and(eq(digestSpecs.isSmoke, true), eq(digestSpecs.isCurrent, true)));

      const perSpec: SmokeSpecSummary[] = [];
      for (const s of specs) {
        perSpec.push(await summariseSmokeSpec(s.id, windowStart));
      }

      return {
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        specsScanned: specs.length,
        perSpec,
        telegramSent: false,
      };
    });

    const text = formatSmokeSummary(output);
    logger.info("smoke-summary", { summary: output, text });

    // Send to the first reachable telegram chat. In the single-tenant
    // smoke world this is just Faeez's chat. We deliberately don't fan
    // out to all owners — there's only ever one.
    const target = output.perSpec.find((s) => s.telegramChatId != null);
    if (target && isTelegramConfigured()) {
      // Wave 5 Bug 15: route smoke-summary through the same splitter the
      // digest pipeline uses, so a long summary doesn't get rejected by
      // Telegram's 4096-char cap. One send per part, via the channel
      // adapter (CAD-207).
      await step.run("send-telegram", async () => {
        for (const part of formatPlainText(text)) {
          await telegramAdapter.send(part, {
            channel: "telegram",
            chatId: Number(target.telegramChatId),
          });
        }
      });
      output.telegramSent = true;
    } else {
      logger.warn("smoke-summary: no telegram target or bot not configured", {
        hasTarget: Boolean(target),
        botConfigured: isTelegramConfigured(),
      });
    }

    return output;
  }
);
