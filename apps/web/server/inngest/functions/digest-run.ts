/**
 * T-211 + T-302: digest.run Inngest handler.
 *
 * Event payload:
 *   - Cron-dispatched (T-301):
 *       { userId, digestRunId, runDate, deliveryMinuteUtc }
 *     A `pending` digest_runs row already exists (claimed by the dispatcher
 *     via the (spec_id, delivery_minute_utc) UNIQUE partial index). This
 *     handler hydrates the existing row.
 *   - Legacy / manual:
 *       { userId, runDate? }
 *     Pre-Phase-3 invocations may still arrive without a digestRunId. The
 *     pipeline falls back to its old insert path.
 *
 * Idempotency:
 *   The dispatcher already won the race; the pipeline trusts that. The old
 *   (user_id, run_date) UNIQUE was dropped in migration 0004, so duplicate
 *   pipeline invocations from a single claimed row are protected only by
 *   Inngest's own at-least-once dedup of the `digestRunId`-keyed event.
 *
 * Errors don't throw out of the function — the pipeline persists the error
 * on the row for T-303 retry.
 */
import { inngest } from "../client";
import { runDigestPipeline } from "@/server/digest/run";

interface ScheduledPayload {
  userId?: string;
  digestRunId?: string;
  runDate?: string;
  deliveryMinuteUtc?: string;
}

export const digestRunFn = inngest.createFunction(
  {
    id: "digest-run",
    name: "Digest run",
    triggers: [{ event: "digest/run.scheduled" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data?: ScheduledPayload };
    step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const userId = event.data?.userId;
    const digestRunId = event.data?.digestRunId;
    const runDate = event.data?.runDate;
    if (!userId) {
      return { skipped: true, reason: "missing userId" };
    }

    const result = await step.run("pipeline", () =>
      runDigestPipeline({
        userId,
        runDate,
        digestRunId,
        // Scheduled runs tolerate source failures so the dispatcher can still
        // produce something useful when one connector is down. T-303 owns
        // hard-fail handling.
        tolerateSourceFailures: true,
      })
    );

    return result;
  }
);
