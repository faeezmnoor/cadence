/**
 * T-301 + T-302 (rewritten CAD-217): tz-aware cron dispatcher.
 *
 * Cron: every 5 minutes, UTC. On each fire:
 *   1. Load every active spec whose `next_run_at` is due (<= now). The
 *      persisted `next_run_at` IS the scheduled instant — there is no
 *      back-look window and no exact-minute wall-clock match, so a late,
 *      skipped, or delayed tick can never strand a schedule (the old
 *      design required `shouldFire(rule, NOW)` minute-equality and a
 *      5-minute back-look: one missed tick = schedule dead forever).
 *   2. Re-validate the rule AT THE SCHEDULED INSTANT (`shouldFire(rule,
 *      scheduledAt)`) — catches mid-flight rule edits (new skipDate,
 *      changed time). Invalid → advance `next_run_at` and skip
 *      (advance-on-skip: a skipped occurrence must never wedge the
 *      schedule).
 *   3. Claim: INSERT a `pending` digest_runs row with
 *      `delivery_minute_utc` = the SCHEDULED minute (not the wall-clock
 *      minute), so concurrent/late ticks racing on the same occurrence
 *      collapse via the (spec_id, delivery_minute_utc) UNIQUE partial
 *      index. `run_date` + `delivery_calendar_day_local` likewise derive
 *      from the scheduled instant, keeping once-per-local-day anchored to
 *      the intended day even when delivery happens after midnight UTC.
 *   4. Advance `next_run_at` from max(now, scheduledAt)+1m on EVERY
 *      outcome (claim, collision, rule-skip) — computeNextRunAt is
 *      deterministic, so concurrent advances converge. Catch-up policy:
 *      after an outage we deliver the single most-recent missed
 *      occurrence (content is composed fresh), then jump to the next
 *      future one — never a backlog flood.
 *   5. Reconcile: after the dispatch loop, repair active specs whose
 *      `next_run_at` is NULL (never computed / failed recompute) so they
 *      re-enter the schedule instead of being invisible forever.
 *
 * Cadence note: `*\/5` means a brief scheduled for 08:03 arrives by
 * 08:05 — within the product's "every morning" promise, and an ~80%
 * Inngest invocation-quota saving vs every-minute. Safe ONLY with the
 * windowed due-check above (with exact-minute matching it would skip
 * every non-:00/:05 schedule — verified in the CAD-217 review).
 */
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import { projectToZone, truncateToUtcMinute } from "@/server/cron/match";
import {
  shouldFire as shouldFireV2,
  nextRunAt as computeNextRunAt,
} from "@/lib/scheduling/evaluator";
import { schedulingRuleV1, type SchedulingRuleV1 } from "@/lib/scheduling/rule";

interface DispatcherSummary {
  scannedSpecs: number;
  matchedSpecs: number;
  claimed: number;
  collisions: number;
  ruleSkips: number;
  reconciled: number;
  errors: Array<{ specId: string; error: string }>;
  minuteUtcIso: string;
}

/** Advance a spec's next_run_at; never throws (caller records the error). */
async function advanceNextRunAt(
  specId: string,
  rule: SchedulingRuleV1,
  fromUtc: Date
): Promise<void> {
  const nextAt = computeNextRunAt(rule, fromUtc);
  await db
    .update(digestSpecs)
    .set({ nextRunAt: nextAt, updatedAt: new Date() })
    .where(eq(digestSpecs.id, specId));
}

/**
 * Exported for unit tests (same pattern as digestRunHandler). The Inngest
 * wrapper below calls this inside a step.
 */
export async function dispatchDueSpecs(nowUtc: Date): Promise<DispatcherSummary> {
  const minuteIso = truncateToUtcMinute(nowUtc).toISOString();

      // 1. Every active spec that is due. No back-look window: overdue is
      // overdue, however late we are.
      const rows = await db
        .select({
          userId: users.id,
          timezone: users.timezone,
          specId: digestSpecs.id,
          scheduling: digestSpecs.scheduling,
          nextRunAt: digestSpecs.nextRunAt,
        })
        .from(users)
        .innerJoin(
          digestSpecs,
          and(
            eq(digestSpecs.userId, users.id),
            eq(digestSpecs.status, "active"),
            sql`${digestSpecs.nextRunAt} IS NOT NULL`,
            lte(digestSpecs.nextRunAt, nowUtc)
          )
        )
        .where(eq(users.state, "active"));

      const out: DispatcherSummary = {
        scannedSpecs: rows.length,
        matchedSpecs: 0,
        claimed: 0,
        collisions: 0,
        ruleSkips: 0,
        reconciled: 0,
        errors: [],
        minuteUtcIso: minuteIso,
      };

      for (const row of rows) {
        const parsed = schedulingRuleV1.safeParse(row.scheduling);
        if (!parsed.success) {
          out.errors.push({ specId: row.specId, error: "invalid_scheduling_rule" });
          continue;
        }
        const rule: SchedulingRuleV1 = parsed.data;
        const scheduledAt = row.nextRunAt!;
        // Base for the next occurrence: strictly after both the scheduled
        // instant and now (catch-up delivers one occurrence, then jumps
        // to the future).
        const advanceFrom = new Date(
          Math.max(nowUtc.getTime(), scheduledAt.getTime()) + 60_000
        );

        // 2. Validate the rule at the SCHEDULED instant. A rule edited
        // since next_run_at was computed may have invalidated this
        // occurrence — skip it but ALWAYS advance.
        if (!shouldFireV2(rule, scheduledAt)) {
          out.ruleSkips++;
          try {
            await advanceNextRunAt(row.specId, rule, advanceFrom);
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            out.errors.push({ specId: row.specId, error: `advance_on_skip_failed: ${error}` });
          }
          continue;
        }
        out.matchedSpecs++;

        // 3. Claim, anchored to the scheduled occurrence (stable across
        // late/racing ticks). Local calendar day in the spec's tz at the
        // scheduled instant drives the once-per-local-day anchor.
        const scheduledMinuteUtc = truncateToUtcMinute(scheduledAt);
        const localDay = projectToZone(scheduledAt, row.timezone).date;

        try {
          const claimed = await db
            .insert(digestRuns)
            .values({
              userId: row.userId,
              specId: row.specId,
              status: "pending",
              runDate: scheduledMinuteUtc.toISOString().slice(0, 10),
              deliveryMinuteUtc: scheduledMinuteUtc,
              deliveryCalendarDayLocal: localDay,
              attemptCount: 0,
            })
            .returning({ id: digestRuns.id })
            .onConflictDoNothing();

          // 4. Advance regardless of claim outcome. Deterministic, so a
          // concurrent dispatcher advancing the same spec converges on
          // the same value.
          try {
            await advanceNextRunAt(row.specId, rule, advanceFrom);
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            out.errors.push({ specId: row.specId, error: `next_run_at_recompute_failed: ${error}` });
          }

          if (claimed.length === 0) {
            out.collisions++;
            continue;
          }
          out.claimed++;

          await inngest.send({
            name: "digest/run.scheduled",
            data: {
              userId: row.userId,
              digestRunId: claimed[0]!.id,
              runDate: scheduledMinuteUtc.toISOString().slice(0, 10),
              deliveryMinuteUtc: scheduledMinuteUtc.toISOString(),
            },
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          out.errors.push({ specId: row.specId, error });
        }
      }

      return out;
}

/**
 * Reconcile: active specs with no next_run_at are invisible to the
 * due-query forever. Recompute them here so a failed recompute (or a
 * spec created before backfill) self-heals within one dispatcher tick.
 * Exported for unit tests.
 */
export async function reconcileNullNextRun(): Promise<number> {
      const stale = await db
        .select({ specId: digestSpecs.id, scheduling: digestSpecs.scheduling })
        .from(digestSpecs)
        .innerJoin(users, eq(users.id, digestSpecs.userId))
        .where(
          and(
            eq(digestSpecs.status, "active"),
            eq(users.state, "active"),
            isNull(digestSpecs.nextRunAt)
          )
        )
        .limit(100);
      let fixed = 0;
      for (const row of stale) {
        const parsed = schedulingRuleV1.safeParse(row.scheduling);
        if (!parsed.success) continue;
        try {
          await advanceNextRunAt(row.specId, parsed.data, new Date());
          fixed++;
        } catch {
          // Next tick retries; the loop is the alert (see summary).
        }
      }
      if (stale.length > 0) {
        console.warn(
          JSON.stringify({
            event: "dispatch.reconcile",
            staleSpecs: stale.length,
            reconciled: fixed,
          })
        );
      }
      return fixed;
}

export const cronDispatch = inngest.createFunction(
  {
    id: "cron-dispatch",
    name: "Cron dispatcher (tz-aware)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const summary: DispatcherSummary = await step.run("dispatch-due", () =>
      dispatchDueSpecs(new Date())
    );
    const reconciled = await step.run("reconcile-null-next-run", () =>
      reconcileNullNextRun()
    );
    return { ...summary, reconciled };
  }
);
