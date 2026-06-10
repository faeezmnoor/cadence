/**
 * Inline-keyboard builder for delivered briefs (T-401 / CAD-42).
 *
 * Telegram caps `callback_data` at 64 BYTES (not chars). Our encoding:
 *
 *   fb:<vote>:<run_id>
 *
 * where vote ∈ {up, down, love, skip} (max 4 chars) and run_id is a UUID
 * (36 chars). Total worst case: 3 + 4 + 1 + 36 + 1 = 45 bytes. Well
 * within budget — no server-side mapping table needed.
 *
 * Keep `vote` short and stable: it's the on-wire schema. Mapping
 * vote -> emoji/label happens client-side (here) and server-side
 * (callback handler toast).
 */

export const FEEDBACK_PREFIX = "fb";

export type FeedbackVote = "up" | "down" | "love" | "skip";

export const FEEDBACK_VOTES: readonly FeedbackVote[] = [
  "up",
  "down",
  "love",
  "skip",
] as const;

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

/** Toast text shown via answerCallbackQuery when a user taps a button. */
export const VOTE_TOAST: Record<FeedbackVote, string> = {
  up: "Logged 👍 — more like this",
  down: "Logged 👎 — less like this",
  love: "Logged 🔥 — loved it",
  skip: "Logged 💤 — skipping topic",
};

const BUTTON_LABEL: Record<FeedbackVote, string> = {
  up: "👍 More like this",
  down: "👎 Less like this",
  love: "🔥 Loved it",
  skip: "💤 Skip topic",
};

const CALLBACK_DATA_MAX_BYTES = 64;

export function encodeCallbackData(vote: FeedbackVote, runId: string): string {
  const data = `${FEEDBACK_PREFIX}:${vote}:${runId}`;
  // Defensive: Telegram silently rejects > 64 bytes. We control the inputs
  // (UUID + fixed vote vocab) so this should never throw, but guarding
  // means a future schema drift fails loud at build/test time rather than
  // silently producing a non-functional keyboard.
  if (Buffer.byteLength(data, "utf8") > CALLBACK_DATA_MAX_BYTES) {
    throw new Error(
      `callback_data exceeds 64 bytes: ${Buffer.byteLength(data, "utf8")} bytes`
    );
  }
  return data;
}

export interface ParsedCallback {
  vote: FeedbackVote;
  runId: string;
}

/** Parse `fb:<vote>:<run_id>`. Returns null on anything we don't recognize. */
export function parseCallbackData(data: string | undefined | null): ParsedCallback | null {
  if (!data) return null;
  const parts = data.split(":");
  if (parts.length !== 3) return null;
  const [prefix, vote, runId] = parts;
  if (prefix !== FEEDBACK_PREFIX) return null;
  if (!(FEEDBACK_VOTES as readonly string[]).includes(vote)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
    return null;
  }
  return { vote: vote as FeedbackVote, runId };
}

/**
 * Build the 4-button inline keyboard markup, laid out 2x2 for a thumb-
 * friendly tap target on mobile.
 */
export function buildFeedbackKeyboard(runId: string): InlineKeyboardMarkup {
  const btn = (v: FeedbackVote): InlineKeyboardButton => ({
    text: BUTTON_LABEL[v],
    callback_data: encodeCallbackData(v, runId),
  });
  return {
    inline_keyboard: [
      [btn("up"), btn("down")],
      [btn("love"), btn("skip")],
    ],
  };
}
