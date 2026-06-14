/**
 * capManageTranscript — server-side context-window bound for manage turns
 * (manage-mode plan §4.3.4, exec RC7 / ACX.6).
 *
 * Persistent per-brief threads — especially reactivated legacy threads —
 * grow without bound, and the chat route passes `body.messages` straight to
 * streamText. The per-turn spec overlay (buildManageContextBlock), not the
 * transcript, is the load-bearing state (AC7.3), so manage turns keep only
 * the last N messages. The system prompt + overlay ride OUTSIDE
 * `body.messages` and are always included — truncation can never lose the
 * spec.
 *
 * Setup turns are untouched (bounded by the ≤3-question interview by
 * construction). The chat-turn cost_events rows (§4.3.5) are the monitoring
 * signal that this cap holds — flat per-turn input tokens as threads age.
 */

export const MANAGE_TRANSCRIPT_CAP = 20;

/**
 * Keep the last `n` messages, oldest dropped first. Pure; never mutates.
 * Generic over the message type so tests don't need the AI SDK shape.
 */
export function capManageTranscript<T>(
  messages: readonly T[],
  n: number = MANAGE_TRANSCRIPT_CAP
): T[] {
  if (n <= 0) return [];
  if (messages.length <= n) return [...messages];
  return messages.slice(-n);
}
