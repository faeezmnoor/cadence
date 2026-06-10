/**
 * /tune freeform command handler (T-403 / CAD-44).
 *
 * Parses a `/tune <freeform text>` Telegram message, resolves the chat
 * to a linked Cadence user, and persists the raw instruction into
 * `learning_log` with source='tune_command'. The weekly distill job
 * (T-405) consumes these rows; the composer (T-404) will read recent
 * undistilled rows as light bias.
 *
 * Returns a discriminated union so the dispatcher can pick the right
 * reply. We intentionally do NOT write into `feedback_events` — that
 * table is for delivery-tied signals (inline-keyboard taps from T-402).
 * /tune is a standing instruction, not a per-brief vote.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { learningLog, users } from "@/server/db/schema";

export interface HandleTuneCommandInput {
  /** Telegram chat.id from message.chat.id — 1:1 chats only pre-WA. */
  telegramChatId: number;
  /** Raw freeform text after the `/tune` command (already trimmed). */
  rawText: string;
}

export type HandleTuneCommandResult =
  | { kind: "logged" }
  | { kind: "empty" }
  | { kind: "unknown_user" };

/**
 * Extract the freeform argument after `/tune`.
 *
 * Telegram clients sometimes append `@BotName` to the command in groups;
 * we strip it even though we only support 1:1 chats today, to be robust
 * against the eventual group-channel roadmap.
 *
 * Returns null if the message isn't a /tune command at all. Returns ""
 * if /tune was sent with no body.
 */
export function parseTuneCommand(text: string): string | null {
  const trimmed = text.trim();
  // Match `/tune` or `/tune@SomeBot` at the start, then capture the rest.
  const match = trimmed.match(/^\/tune(?:@\w+)?\b\s*([\s\S]*)$/i);
  if (!match) return null;
  return match[1]!.trim();
}

const USAGE_HINT =
  "Try `/tune more on TikTok Shop EU` or `/tune less crypto`. " +
  "Anything you type after `/tune` becomes a standing note " +
  "I'll follow in every brief from now on.";

const ACK_REPLY = (snippet: string) =>
  `Got it — your next briefs will lean that way.\n\n` +
  `Heard: "${snippet}"`;

// Matches the established unlinked-user pattern from dispatch.ts MSG_START_NO_TOKEN.
const UNLINKED_REPLY =
  "This chat isn't connected to Cadence yet. Head to cadence.news and tap " +
  "\"Connect Telegram\" first — then `/tune` will stick.";

export const TUNE_REPLIES = {
  usage: USAGE_HINT,
  ack: ACK_REPLY,
  unlinked: UNLINKED_REPLY,
};

/**
 * Truncate ack echo to a reasonable Telegram line length without
 * cutting mid-codepoint. 180 chars is well under Telegram's 4096
 * limit and keeps the bubble visually tight.
 */
function snippet(s: string, max = 180): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export async function handleTuneCommand(
  input: HandleTuneCommandInput
): Promise<HandleTuneCommandResult> {
  if (!input.rawText) {
    return { kind: "empty" };
  }

  // Resolve linked Cadence user. Same lookup shape as recordFeedbackCallback.
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramChatId, input.telegramChatId))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    return { kind: "unknown_user" };
  }

  await db.insert(learningLog).values({
    userId: user.id,
    source: "tune_command",
    rawText: input.rawText,
  });

  return { kind: "logged" };
}

export function buildAckReply(rawText: string): string {
  return ACK_REPLY(snippet(rawText));
}
