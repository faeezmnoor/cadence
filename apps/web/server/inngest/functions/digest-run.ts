/**
 * T-211 + T-302 + T-303: digest.run Inngest handler.
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
 * Retry policy (T-303):
 *   - Inngest's native function-level `retries: MAX_DELIVERY_ATTEMPTS - 1`
 *     gives us 3 total invocations with built-in exponential backoff
 *     (Inngest defaults: ~30s, then exponential up to ~10 min, with jitter).
 *     This is the only retry layer — we deliberately do NOT schedule
 *     re-attempts via step.sendEvent because that would race the cron-claim
 *     unique index in the same minute slot.
 *   - On a transient failure with attempt_count < MAX_DELIVERY_ATTEMPTS:
 *     we throw. Inngest reschedules. The pipeline's failure path already
 *     wrote sanitized last_error + bumped attempt_count atomically.
 *   - On a permanent error (4xx, "bot was blocked", "chat not found")
 *     OR on transient exhaustion (attempt_count >= MAX): we flip
 *     users.state -> 'delivery_broken'. The cron dispatcher's
 *     `where(eq(users.state, 'active'))` immediately stops claiming new
 *     minute slots for this user. Recovery is owned by T-305 admin replay
 *     (which resets state -> 'active') or by a spec update path.
 *   - T-304 update (2026-06-02): successful delivery DOES auto-clear
 *     delivery_broken. The dispatcher's `state = 'active'` filter means a
 *     broken user wouldn't normally reach this handler, but a manual
 *     sampleNow / Inngest replay can succeed and we want that to heal the
 *     user automatically. Implementation lives in
 *     `runDigestPipeline` (one helper covers both entry points).
 *
 * Idempotency:
 *   The dispatcher already won the race; the pipeline trusts that. The old
 *   (user_id, run_date) UNIQUE was dropped in migration 0004, so duplicate
 *   pipeline invocations from a single claimed row are protected only by
 *   Inngest's at-least-once dedup of the `digestRunId`-keyed event PLUS
 *   the atomic SQL `attempt_count + 1` increment (no race-clobber).
 */
import { eq } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { runDigestPipeline, MAX_DELIVERY_ATTEMPTS } from "@/server/digest/run";

interface ScheduledPayload {
  userId?: string;
  digestRunId?: string;
  runDate?: string;
  deliveryMinuteUtc?: string;
}

/**
 * Thrown when the pipeline failed with a retryable error and Inngest should
 * reschedule. Exposes the sanitized message (already safe to log) so the
 * Inngest dashboard surfaces useful info without leaking PII.
 */
class TransientDeliveryError extends Error {
  readonly attemptCount: number;
  constructor(message: string, attemptCount: number) {
    super(message);
    this.name = "TransientDeliveryError";
    this.attemptCount = attemptCount;
  }
}

interface HandlerCtx {
  event: { data?: ScheduledPayload };
  step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> };
  attempt: number;
}

/**
 * Exported for unit tests in `test/digest-retry.test.ts`. Inngest wraps this
 * in createFunction below; tests bypass Inngest's runtime and invoke the
 * closure directly with a mock step + event payload.
 */
export async function digestRunHandler(ctx: HandlerCtx): Promise<unknown> {
  const { event, step, attempt } = ctx;
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
      // produce something useful when one connector is down.
      tolerateSourceFailures: true,
    })
  );

  if (result.status !== "failed") {
    return result;
  }

  // ---- Failure escalation (T-303) ----
  const attemptCount = result.attemptCount ?? attempt + 1;
  const exhausted = attemptCount >= MAX_DELIVERY_ATTEMPTS;
  const permanent = result.errorClass === "permanent";

  if (permanent || exhausted) {
    // Flip the user to delivery_broken. The dispatcher's active-state
    // filter does the rest. Structured log line for T-304 / Axiom.
    await step.run("mark-delivery-broken", async () => {
      await db
        .update(users)
        .set({ state: "delivery_broken", updatedAt: new Date() })
        .where(eq(users.id, userId));
    });

    console.warn(
      JSON.stringify({
        event: "digest.delivery_broken",
        userId,
        digestRunId,
        attemptCount,
        errorClass: result.errorClass,
        reason: permanent ? "permanent_error" : "max_attempts_exhausted",
        lastError: result.error,
      })
    );

    // Return rather than throw — we don't want Inngest to retry past
    // this point.
    return {
      status: "failed",
      digestRunId,
      deliveryBroken: true,
      attemptCount,
      error: result.error,
    };
  }

  // Transient + retries remaining: throw so Inngest reschedules with its
  // native backoff. The sanitized message is safe to surface.
  throw new TransientDeliveryError(
    result.error ?? "transient delivery failure",
    attemptCount
  );
}

export const digestRunFn = inngest.createFunction(
  {
    id: "digest-run",
    name: "Digest run",
    // T-303: 3 total invocations (initial + 2 retries). Inngest's native
    // exponential backoff with jitter handles the spacing; that's the
    // "retry framework" we're standardizing on.
    retries: (MAX_DELIVERY_ATTEMPTS - 1) as 2,
    triggers: [{ event: "digest/run.scheduled" }],
  },
  digestRunHandler as Parameters<typeof inngest.createFunction>[1]
);
