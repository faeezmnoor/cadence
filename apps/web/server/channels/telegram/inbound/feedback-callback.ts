/**
 * Inline-keyboard callback recorder (T-402 / CAD-43).
 *
 * Resolves the Telegram user -> Cadence user, validates the digest_run
 * belongs to that user, and inserts a feedback_events row. Idempotent
 * on `telegram_callback_id` (UNIQUE partial index from migration 0006):
 * a Telegram webhook retry can never double-count a vote.
 *
 * Returns a discriminated union so the dispatcher can pick the right
 * answerCallbackQuery toast.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, feedbackEvents, users } from "@/server/db/schema";
import type { FeedbackVote } from "../keyboard";

export interface RecordFeedbackCallbackInput {
  callbackId: string;
  telegramUserId: number;
  telegramChatId: number | null;
  runId: string;
  vote: FeedbackVote;
}

export type RecordFeedbackCallbackResult =
  | { kind: "recorded" }
  | { kind: "duplicate" }
  | { kind: "unknown_user" }
  | { kind: "unknown_run" };

/**
 * Map keyboard vote to legacy signal_type so existing analytics keep
 * working. `love` and `up` both register as thumbs_up at the signal layer;
 * the `vote` column preserves the distinction.
 */
function voteToSignalType(vote: FeedbackVote): string {
  switch (vote) {
    case "up":
    case "love":
      return "thumbs_up";
    case "down":
    case "skip":
      return "thumbs_down";
  }
}

export async function recordFeedbackCallback(
  input: RecordFeedbackCallbackInput
): Promise<RecordFeedbackCallbackResult> {
  // Resolve Cadence user. Prefer telegram_chat_id since it's the linked
  // surface; telegram_user_id of the tapping user equals chat_id for 1:1
  // bot chats (which is all we support pre-WA).
  const lookupId = input.telegramChatId ?? input.telegramUserId;
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramChatId, lookupId))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    return { kind: "unknown_user" };
  }

  // Validate digest_run belongs to this user. Prevents a malicious
  // crafted callback_data from logging votes against another user's
  // brief (defense-in-depth — Telegram itself validates the originating
  // chat, but our callback_data carries a user-controllable run_id).
  const runRows = await db
    .select({ id: digestRuns.id })
    .from(digestRuns)
    .where(and(eq(digestRuns.id, input.runId), eq(digestRuns.userId, user.id)))
    .limit(1);
  if (!runRows[0]) {
    return { kind: "unknown_run" };
  }

  // Insert with ON CONFLICT DO NOTHING semantics on the partial unique
  // index for telegram_callback_id. Drizzle's onConflictDoNothing targets
  // the index by column list — matches migration 0006.
  const inserted = await db
    .insert(feedbackEvents)
    .values({
      userId: user.id,
      digestRunId: input.runId,
      vote: input.vote,
      signalType: voteToSignalType(input.vote),
      telegramCallbackId: input.callbackId,
      source: "inline_keyboard",
    })
    .onConflictDoNothing({ target: feedbackEvents.telegramCallbackId })
    .returning({ id: feedbackEvents.id });

  if (inserted.length === 0) {
    return { kind: "duplicate" };
  }
  return { kind: "recorded" };
}
