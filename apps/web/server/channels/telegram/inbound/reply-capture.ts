/**
 * Reply-to-brief capture with explicit confirm (CAD-220, Part 1).
 *
 * Wave 1 wired 👍/👎 keyboard votes into learning_log via SYSTEM-built
 * fingerprints (feedback-callback.ts). Free text is different: learning_log
 * rows are injected VERBATIM into the composer prompt, so per the joint
 * CPO×CTO ruling a user's reply must be explicitly confirmed before it
 * becomes a standing note (prompt-injection + false-positive guard — people
 * reply "thanks" to briefs and that must not bias next week's research).
 *
 * Flow:
 *   1. User replies (Telegram reply_to_message) to a delivered brief.
 *   2. `matchBriefReply` checks the replied-to message_id against
 *      digest_runs.telegram_message_id for the chat's linked user (same
 *      ownership pattern as recordFeedbackCallback: resolve user by
 *      telegram_chat_id, then filter the run by user_id).
 *   3. On match the dispatcher sends a CONFIRM message quoting a sanitized
 *      ≤180-char snippet, with a [💾 Save] [Ignore] inline keyboard.
 *      NOTHING is written yet.
 *   4. The confirm keyboard's callback_data is just `tn:yes` / `tn:no`
 *      (callback_data caps at 64 BYTES — it cannot carry the text). On
 *      `tn:yes` the candidate note is read back OUT of the confirm
 *      message's own text (between the quotes) — Telegram is the storage;
 *      no DB pending state, no schema change.
 *   5. `saveStandingNote` re-sanitizes, hard-caps at 300 chars, and writes
 *      learning_log source='telegram_reply'.
 *
 * The `tn:` callback encoding is deliberately separate from keyboard.ts's
 * `fb:` vote encoding — that file's encode/parse is the Wave 1 on-wire
 * schema and stays untouched.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, learningLog, users } from "@/server/db/schema";
import { emitLearningSignal } from "@/server/inngest/learning-signal";
import type { InlineKeyboardMarkup } from "../keyboard";

// ---------------------------------------------------------------------------
// tn: callback encoding (2-button confirm keyboard)
// ---------------------------------------------------------------------------

export const TUNE_NOTE_PREFIX = "tn";

export type TuneNoteDecision = "yes" | "no";

/** `tn:yes` (6 bytes) / `tn:no` (5 bytes) — trivially inside the 64-byte cap. */
export function encodeTuneNoteCallback(decision: TuneNoteDecision): string {
  return `${TUNE_NOTE_PREFIX}:${decision}`;
}

export function parseTuneNoteCallback(
  data: string | undefined | null
): TuneNoteDecision | null {
  if (data === `${TUNE_NOTE_PREFIX}:yes`) return "yes";
  if (data === `${TUNE_NOTE_PREFIX}:no`) return "no";
  return null;
}

export function buildTuneNoteKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "💾 Save", callback_data: encodeTuneNoteCallback("yes") },
        { text: "Ignore", callback_data: encodeTuneNoteCallback("no") },
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// Sanitization / truncation bounds (CAD-220 §5)
// ---------------------------------------------------------------------------

/** Max chars echoed in the confirm message (and therefore saved on tn:yes). */
export const SNIPPET_MAX_CHARS = 180;

/** Hard cap on learning_log.raw_text — defense-in-depth over the snippet cap. */
export const NOTE_MAX_CHARS = 300;

/**
 * Strip newlines and backticks, collapse runs of whitespace. Newlines would
 * let a note fake extra "lines" inside the composer prompt's feedback block;
 * backticks would let it open/close code fences there. Both go.
 */
export function sanitizeNoteText(text: string): string {
  return text.replace(/`/g, "").replace(/\s+/g, " ").trim();
}

/** First ≤180 chars of the sanitized text, ellipsized like tune-command's echo. */
export function buildSnippet(text: string): string {
  const clean = sanitizeNoteText(text);
  if (clean.length <= SNIPPET_MAX_CHARS) return clean;
  return clean.slice(0, SNIPPET_MAX_CHARS - 1) + "…";
}

// ---------------------------------------------------------------------------
// Confirm message — Telegram itself stores the pending note
// ---------------------------------------------------------------------------

export const CONFIRM_PROMPT_PREFIX =
  "Save this as a standing note for your briefs?";

export function buildConfirmText(snippet: string): string {
  return `${CONFIRM_PROMPT_PREFIX}\n\n"${snippet}"`;
}

/**
 * Read the candidate note back out of the confirm message's own text
 * (callback_query.message.text). First-to-last quote, so a note containing
 * `"` round-trips. Returns null when the message isn't our confirm shape —
 * e.g. Telegram dropped `message` on an old callback, or the message was
 * already edited to its Saved/Not-saved form.
 */
export function extractSnippetFromConfirmText(
  text: string | undefined | null
): string | null {
  if (!text || !text.startsWith(CONFIRM_PROMPT_PREFIX)) return null;
  const first = text.indexOf('"');
  const last = text.lastIndexOf('"');
  if (first === -1 || last <= first) return null;
  const snippet = text.slice(first + 1, last).trim();
  return snippet.length > 0 ? snippet : null;
}

// ---------------------------------------------------------------------------
// User-facing copy (COPY_GUIDE: bot says "I", no exclamation marks)
// ---------------------------------------------------------------------------

export const REPLY_CAPTURE_COPY = {
  /** answerCallbackQuery toast on tn:yes success. */
  toastSaved: "Saved — your next briefs will lean that way.",
  /** answerCallbackQuery toast on tn:no. */
  toastIgnored: "Ignored.",
  /** Mirrors the established unlinked-chat toast from the fb: flow. */
  toastUnlinked: "Connect this chat to Cadence on the web first.",
  /** Confirm message too old / already resolved — one action, per error anatomy. */
  toastExpired: "That confirmation expired. Reply to the brief again.",
  /** Confirm message body after tn:yes. */
  savedMessage: (snippet: string) => `💾 Saved: "${snippet}"`,
  /** Confirm message body after tn:no. */
  notSavedMessage: "Not saved.",
};

/** learning_log.source value for confirmed reply notes. */
export const TELEGRAM_REPLY_SOURCE = "telegram_reply";

// ---------------------------------------------------------------------------
// Match: is this free-text message a reply to one of THIS user's briefs?
// ---------------------------------------------------------------------------

export type BriefReplyMatch =
  | { kind: "match"; snippet: string }
  | { kind: "no_match" };

export interface MatchBriefReplyInput {
  /** Telegram chat.id from message.chat.id — 1:1 chats only pre-WA. */
  telegramChatId: number;
  /** message.reply_to_message.message_id — what the user replied to. */
  replyToMessageId: number;
  /** The user's free-text reply body. */
  text: string;
}

/**
 * Resolve chat -> linked Cadence user, then check the replied-to message
 * is one of that user's delivered briefs. Two-step lookup mirrors
 * recordFeedbackCallback: filtering digest_runs by user_id means a reply
 * forwarded into a foreign chat (or a chat linked to a different user)
 * can never capture against someone else's brief.
 */
export async function matchBriefReply(
  input: MatchBriefReplyInput
): Promise<BriefReplyMatch> {
  const clean = sanitizeNoteText(input.text);
  if (!clean) return { kind: "no_match" };

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramChatId, input.telegramChatId))
    .limit(1);
  const user = userRows[0];
  if (!user) return { kind: "no_match" };

  const runRows = await db
    .select({ id: digestRuns.id })
    .from(digestRuns)
    .where(
      and(
        eq(digestRuns.userId, user.id),
        eq(digestRuns.telegramMessageId, input.replyToMessageId)
      )
    )
    .limit(1);
  if (!runRows[0]) return { kind: "no_match" };

  return { kind: "match", snippet: buildSnippet(clean) };
}

// ---------------------------------------------------------------------------
// Save: tn:yes — write the confirmed note into learning_log
// ---------------------------------------------------------------------------

export type SaveStandingNoteResult =
  | { kind: "saved" }
  | { kind: "unknown_user" }
  | { kind: "empty" };

export interface SaveStandingNoteInput {
  /** Chat the confirm keyboard lives in (callback_query.message.chat.id). */
  telegramChatId: number;
  /** Snippet parsed back out of the confirm message text. */
  noteText: string;
}

export async function saveStandingNote(
  input: SaveStandingNoteInput
): Promise<SaveStandingNoteResult> {
  // Re-sanitize + hard-cap on write. The snippet already passed through
  // buildSnippet before being quoted, but the stored value must hold its
  // bounds even if the confirm message were somehow tampered with.
  const note = sanitizeNoteText(input.noteText).slice(0, NOTE_MAX_CHARS);
  if (!note) return { kind: "empty" };

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramChatId, input.telegramChatId))
    .limit(1);
  const user = userRows[0];
  if (!user) return { kind: "unknown_user" };

  await db.insert(learningLog).values({
    userId: user.id,
    source: TELEGRAM_REPLY_SOURCE,
    rawText: note,
  });

  // CAD-220 Part 2: nudge the event-triggered distill (debounced per user).
  await emitLearningSignal(user.id);

  return { kind: "saved" };
}
