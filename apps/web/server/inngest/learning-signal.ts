/**
 * `learning/signal.recorded` event (CAD-220, Part 2).
 *
 * Every learning_log write site (tune-command, feedback-callback,
 * reply-capture) emits this event so the debounced distill-on-signal
 * function can fold fresh signals into users.distilled_prefs without
 * waiting for the Sunday sweep. One module owns the event name so the
 * senders and the function trigger can never drift.
 */
import { inngest } from "./client";

export const LEARNING_SIGNAL_EVENT = "learning/signal.recorded";

export interface LearningSignalData {
  userId: string;
}

/**
 * Best-effort publish. The learning_log row is already durably written by
 * the time this fires — a transient Inngest outage must not break the
 * user-facing ack/toast, and the Sunday weekly-distill sweep picks up
 * anything a dropped event would have triggered.
 */
export async function emitLearningSignal(userId: string): Promise<void> {
  try {
    await inngest.send({
      name: LEARNING_SIGNAL_EVENT,
      data: { userId } satisfies LearningSignalData,
    });
  } catch (err) {
    console.error("[learning-signal:send]", err);
  }
}
