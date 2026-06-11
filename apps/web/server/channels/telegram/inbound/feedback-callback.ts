/**
 * Inline-keyboard callback recorder (T-402 / CAD-43).
 *
 * Resolves the Telegram user -> Cadence user, validates the digest_run
 * belongs to that user, and inserts a feedback_events row. Idempotent
 * on `telegram_callback_id` (UNIQUE partial index from migration 0006):
 * a Telegram webhook retry can never double-count a vote.
 *
 * CAD-211: a RECORDED vote (not a duplicate) additionally writes a
 * compact, SYSTEM-constructed fingerprint line into `learning_log`
 * (source='feedback_event') so the composer's feedback block and the
 * weekly distill actually see keyboard votes. The fingerprint is built
 * from our own data (vote label + run date + composed-markdown section
 * headings + spec topics) — it never embeds user free text, per the
 * prompt-injection guard ruling.
 *
 * Returns a discriminated union so the dispatcher can pick the right
 * answerCallbackQuery toast.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, feedbackEvents, learningLog, users } from "@/server/db/schema";
import { emitLearningSignal } from "@/server/inngest/learning-signal";
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

/**
 * CAD-211: human-readable vote label for the learning_log fingerprint.
 * Mirrors the inline-keyboard button labels so the distill prompt and a
 * human reading /learning see the same vocabulary.
 */
const VOTE_FINGERPRINT_LABEL: Record<FeedbackVote, string> = {
  up: "👍 (more like this)",
  down: "👎 (less like this)",
  love: "🔥 (loved it)",
  skip: "💤 (skip topic)",
};

/** Hard cap on the fingerprint line persisted to learning_log.raw_text. */
export const FINGERPRINT_MAX_CHARS = 200;

/**
 * Section headings the fingerprint should skip — boilerplate present in
 * every brief, so they carry zero signal for the distill job.
 */
const BOILERPLATE_HEADINGS = new Set(["sources", "why this matters to you", "tl;dr"]);

/**
 * Pull up to `max` section headings out of the composed brief markdown.
 * Cheap regex only — no LLM.
 *
 * The renderer (server/ai/composer/render.ts) emits whole-line bold
 * headings (`*Prices*`) for Telegram parse_mode Markdown; we also accept
 * `## Heading` for future channel renderers. Whole-line bolds containing
 * "·" are the wordmark/date header, not sections.
 */
export function extractSectionHeadings(
  markdown: string | null | undefined,
  max = 3
): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    const m = trimmed.match(/^#{1,6}\s+(.+)$/) ?? trimmed.match(/^\*([^*]+)\*$/);
    if (!m) continue;
    const heading = m[1]!.replace(/[*_`#]/g, "").trim().slice(0, 40);
    if (!heading) continue;
    if (heading.includes("·")) continue;
    if (BOILERPLATE_HEADINGS.has(heading.toLowerCase())) continue;
    out.push(heading);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * CAD-211: build the compact fingerprint line written to learning_log.
 *
 * Example:
 *   `👍 (more like this) on brief 2026-06-11 — sections: Prices, What moved; about: CPO, MPOB`
 *
 * SYSTEM-constructed only: vote label (ours), run date (ours), section
 * headings (from our composed markdown), spec topics (already trusted
 * spec content). No Telegram free text ever flows through here.
 */
export function buildBriefFingerprint(args: {
  vote: FeedbackVote;
  runDate: string;
  sections: string[];
  topics: string[];
}): string {
  let line = `${VOTE_FINGERPRINT_LABEL[args.vote]} on brief ${args.runDate}`;
  if (args.sections.length > 0) {
    line += ` — sections: ${args.sections.slice(0, 3).join(", ")}`;
  }
  if (args.topics.length > 0) {
    line += `${args.sections.length > 0 ? ";" : " —"} about: ${args.topics.slice(0, 3).join(", ")}`;
  }
  if (line.length > FINGERPRINT_MAX_CHARS) {
    line = line.slice(0, FINGERPRINT_MAX_CHARS - 1) + "…";
  }
  return line;
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
  // CAD-211: also pull what the fingerprint needs (run date, composed
  // markdown for section headings, spec id for topics) so a recorded vote
  // doesn't cost a second digest_runs round-trip.
  const runRows = await db
    .select({
      id: digestRuns.id,
      specId: digestRuns.specId,
      runDate: digestRuns.runDate,
      composedMarkdown: digestRuns.composedMarkdown,
    })
    .from(digestRuns)
    .where(and(eq(digestRuns.id, input.runId), eq(digestRuns.userId, user.id)))
    .limit(1);
  const run = runRows[0];
  if (!run) {
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
    // Webhook retry / double-tap: the vote already counted, so the
    // learning_log fingerprint below must NOT double-write either.
    return { kind: "duplicate" };
  }

  // CAD-211: mirror the recorded vote into learning_log so the composer's
  // feedback block (T-404) and weekly distill (T-405) learn from keyboard
  // taps. All four votes write — positive signal matters too. Best-effort:
  // the vote itself is already durably recorded; a fingerprint failure
  // shouldn't break the answerCallbackQuery toast.
  try {
    const specRows = run.specId
      ? await db
          .select({ spec: digestSpecs.spec })
          .from(digestSpecs)
          .where(eq(digestSpecs.id, run.specId))
          .limit(1)
      : [];
    const spec = (specRows[0]?.spec ?? {}) as { topics?: unknown };
    const topics = Array.isArray(spec.topics)
      ? spec.topics.filter((t): t is string => typeof t === "string")
      : [];

    const fingerprint = buildBriefFingerprint({
      vote: input.vote,
      runDate: String(run.runDate).slice(0, 10),
      sections: extractSectionHeadings(run.composedMarkdown),
      topics,
    });

    await db.insert(learningLog).values({
      userId: user.id,
      source: "feedback_event",
      rawText: fingerprint,
    });

    // CAD-220: nudge the event-triggered distill (debounced per user).
    // Inside the same best-effort block — a dropped event is swept up by
    // the Sunday weekly-distill cron.
    await emitLearningSignal(user.id);
  } catch (err) {
    console.error("[feedback-callback:learning_log]", err);
  }

  return { kind: "recorded" };
}
