/**
 * T-301 + T-302: every-minute tz-aware cron dispatcher.
 *
 * Cron `* * * * *` (UTC). On each fire:
 *   1. Load every active user joined to their current digest_spec.
 *   2. For each pair, project NOW into the user's IANA tz and check if
 *      the spec's cadence (frequency + delivery_time_local + days_of_week)
 *      matches the current minute.
 *   3. For each match: INSERT a `pending` digest_runs row with
 *      delivery_minute_utc set to the truncated UTC minute. The UNIQUE
 *      partial index (spec_id, delivery_minute_utc) makes this safe
 *      under any number of concurrent dispatcher invocations — only the
 *      row-creator gets an id back; the rest collapse via
 *      ON CONFLICT DO NOTHING.
 *   4. For each newly-claimed row, emit `digest/run.scheduled` carrying
 *      the digest_runs.id so the worker hydrates the existing row instead
 *      of re-inserting (and avoiding the legacy (user_id, run_date)
 *      collision path entirely).
 *
 * Concurrency:
 *   - Inngest fan-out is sequential within a single invocation but
 *     Inngest itself may re-deliver the cron event on retries. The
 *     partial unique index is the correctness anchor — every other
 *     part of this function is optimization.
 *   - We cap to one concurrent dispatcher (concurrency.limit = 1) so a
 *     stuck pipeline can't pile up worker fan-out.
 */
import { and, eq, gt, lte, sql } from "drizzle-orm";
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
  errors: Array<{ specId: string; error: string }>;
  minuteUtcIso: string;
}

export const cronDispatch = inngest.createFunction(
  {
    id: "cron-dispatch",
    name: "Cron dispatcher (tz-aware)",
    concurrency: { limit: 1 },
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    const summary: DispatcherSummary = await step.run("dispatch-minute", async () => {
      const nowUtc = new Date();
      const minuteUtc = truncateToUtcMinute(nowUtc);
      const minuteIso = minuteUtc.toISOString();

      // 1. Pull every active spec whose next_run_at is within the current
      // window. The 5-minute back-look catches cron skew or one missed
      // tick; shouldFireV2 below is the correctness gate that prevents
      // double-firing within the same minute.
      const windowFloor = new Date(nowUtc.getTime() - 5 * 60_000);
      const rows = await db
        .select({
          userId: users.id,
          timezone: users.timezone,
          specId: digestSpecs.id,
          scheduling: digestSpecs.scheduling,
        })
        .from(users)
        .innerJoin(
          digestSpecs,
          and(
            eq(digestSpecs.userId, users.id),
            eq(digestSpecs.status, "active"),
            sql`${digestSpecs.nextRunAt} IS NOT NULL`,
            lte(digestSpecs.nextRunAt, nowUtc),
            gt(digestSpecs.nextRunAt, windowFloor),
          )
        )
        .where(eq(users.state, "active"));

      const out: DispatcherSummary = {
        scannedSpecs: rows.length,
        matchedSpecs: 0,
        claimed: 0,
        collisions: 0,
        errors: [],
        minuteUtcIso: minuteIso,
      };

      // 2 + 3 + 4. Match → claim → emit. Sequential to keep error reporting
      // legible; the per-row work is small (one INSERT + one event publish).
      for (const row of rows) {
        // Parse the scheduling rule defensively — backfill should have
        // populated this for every active spec but a Zod failure here
        // means we'd silently fire on a corrupt rule.
        const parsed = schedulingRuleV1.safeParse(row.scheduling);
        if (!parsed.success) {
          out.errors.push({ specId: row.specId, error: "invalid_scheduling_rule" });
          continue;
        }
        const rule: SchedulingRuleV1 = parsed.data;

        // Correctness gate — re-evaluate at dispatch time. Catches: mid-flight
        // skipDates edits, DST seam between now and the stale next_run_at,
        // and the 5-minute window catching a tick that's actually skipped.
        if (!shouldFireV2(rule, nowUtc)) continue;
        out.matchedSpecs++;

        // CAD-36 follow-up: the user's local calendar day at claim time, in
        // the spec's tz. Drives the second idempotency anchor that catches
        // DST fall-back duplicate-fire (same local day, two distinct UTC
        // minutes).
        const localDay = projectToZone(nowUtc, row.timezone).date;

        // Claim the minute. ON CONFLICT DO NOTHING + RETURNING id gives us a
        // single round-trip "did I win" signal.
        //
        // We have TWO partial UNIQUE indexes on digest_runs:
        //   - (spec_id, delivery_minute_utc)         — race-safe minute claim
        //   - (spec_id, delivery_calendar_day_local) — once-per-local-day
        // The minute index is the primary target; the calendar-day collision
        // will surface as a generic unique-violation. We catch both via
        // .onConflictDoNothing() without a target so either constraint
        // collapses cleanly.
        try {
          const claimed = await db
            .insert(digestRuns)
            .values({
              userId: row.userId,
              specId: row.specId,
              status: "pending",
              runDate: minuteIso.slice(0, 10), // YYYY-MM-DD in UTC
              deliveryMinuteUtc: minuteUtc,
              deliveryCalendarDayLocal: localDay,
              attemptCount: 0,
            })
            .returning({ id: digestRuns.id })
            .onConflictDoNothing();

          if (claimed.length === 0) {
            out.collisions++;
            continue;
          }

          out.claimed++;

          // Recompute and persist next_run_at so the next minute's query
          // doesn't re-pull this spec until the actual next occurrence.
          // Failure here is non-fatal — worst case the row stays in the
          // 5-minute window and the shouldFireV2 gate suppresses
          // duplicate dispatch.
          try {
            const nextAt = computeNextRunAt(rule, new Date(nowUtc.getTime() + 60_000));
            await db
              .update(digestSpecs)
              .set({ nextRunAt: nextAt, updatedAt: new Date() })
              .where(eq(digestSpecs.id, row.specId));
          } catch (err) {
            // Log via the per-spec error path but don't break dispatch.
            const error = err instanceof Error ? err.message : String(err);
            out.errors.push({ specId: row.specId, error: `next_run_at_recompute_failed: ${error}` });
          }

          await inngest.send({
            name: "digest/run.scheduled",
            data: {
              userId: row.userId,
              digestRunId: claimed[0]!.id,
              runDate: minuteIso.slice(0, 10),
              deliveryMinuteUtc: minuteIso,
            },
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          out.errors.push({ specId: row.specId, error });
        }
      }

      return out;
    });

    return summary;
  }
);
