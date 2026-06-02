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
import { and, eq } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import { shouldFire, truncateToUtcMinute } from "@/server/cron/match";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

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

      // 1. Pull every active user + their current spec in one query.
      const rows = await db
        .select({
          userId: users.id,
          timezone: users.timezone,
          specId: digestSpecs.id,
          spec: digestSpecs.spec,
        })
        .from(users)
        .innerJoin(
          digestSpecs,
          and(eq(digestSpecs.userId, users.id), eq(digestSpecs.isCurrent, true))
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
        const spec = row.spec as DigestSpecV1;
        if (!spec?.cadence) continue;

        const fire = shouldFire({
          nowUtc,
          timezone: row.timezone,
          cadence: spec.cadence,
        });
        if (!fire) continue;
        out.matchedSpecs++;

        // Claim the minute. ON CONFLICT DO NOTHING + RETURNING id gives us a
        // single round-trip "did I win" signal.
        try {
          const claimed = await db
            .insert(digestRuns)
            .values({
              userId: row.userId,
              specId: row.specId,
              status: "pending",
              runDate: minuteIso.slice(0, 10), // YYYY-MM-DD in UTC
              deliveryMinuteUtc: minuteUtc,
              attemptCount: 0,
            })
            .returning({ id: digestRuns.id })
            .onConflictDoNothing({
              target: [digestRuns.specId, digestRuns.deliveryMinuteUtc],
            });

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
