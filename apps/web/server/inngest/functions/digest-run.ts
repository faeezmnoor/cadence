/**
 * T-211: digest.run Inngest handler.
 *
 * Event payload: `{ userId, runDate }`. Scheduled by the cadence cron
 * (T-301, Phase 3) for each user whose local-time delivery slot matches
 * the current minute. The handler is idempotent: it relies on the
 * (user_id, run_date) unique index in digest_runs to skip duplicates
 * cleanly.
 *
 * Errors don't throw out of the function — the pipeline persists a
 * `failed` row with the error message for later retry by T-303.
 */
import { inngest } from "../client";
import { runDigestPipeline } from "@/server/digest/run";

export const digestRunFn = inngest.createFunction(
  {
    id: "digest-run",
    name: "Digest run",
    triggers: [{ event: "digest/run.scheduled" }],
  },
  async ({ event, step }: { event: { data?: { userId?: string; runDate?: string } }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const userId = event.data?.userId;
    const runDate = event.data?.runDate;
    if (!userId) {
      return { skipped: true, reason: "missing userId" };
    }

    const result = await step.run("pipeline", () =>
      runDigestPipeline({
        userId,
        runDate,
        // Scheduled runs do NOT tolerate Brave missing-key in the future
        // (compose would be too sparse to be useful), but for the MVP
        // we tolerate so the cron path still produces something to send.
        tolerateSourceFailures: true,
      })
    );

    return result;
  }
);
