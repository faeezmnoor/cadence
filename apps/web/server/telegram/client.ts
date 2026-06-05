/**
 * Telegram bot client (grammY).
 *
 * We intentionally do NOT call `bot.start()` — Cadence is webhook-driven,
 * not long-polling. The `Bot` instance here is used purely to:
 *  - decode and dispatch incoming Update payloads (`bot.handleUpdate`)
 *  - send outgoing messages (`bot.api.sendMessage`)
 *
 * Token is read lazily so build-time / test-time without TELEGRAM_BOT_TOKEN
 * still works. Callers that need to send must check `isTelegramConfigured()`.
 */
import { Bot } from "grammy";

let cached: Bot | null = null;

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getBot(): Bot {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN not set. See docs/TELEGRAM_BOT_SETUP.md (CAD-24)."
    );
  }
  if (!cached) {
    cached = new Bot(process.env.TELEGRAM_BOT_TOKEN);
  }
  return cached;
}

export function getBotUsername(): string {
  return process.env.BOT_USERNAME ?? "cadence_brief_bot";
}

/** Deep-link a user starts to link their account. */
export function buildStartDeepLink(token: string): string {
  return `https://t.me/${getBotUsername()}?start=${token}`;
}

/**
 * Detect Telegram's "can't parse entities" error.
 *
 * Telegram returns HTTP 400 with `description` containing
 * `can't parse entities: ...` (e.g. "Can't find end of the entity starting
 * at byte offset 3170") when the message body contains malformed Markdown —
 * unbalanced `*`, `_`, backtick, `[]()`, etc. The composer LLM occasionally
 * emits broken markdown; rather than coupling the composer prompt to
 * Telegram's exact dialect, we catch the error at the send boundary and
 * retry as plain text.
 *
 * grammy throws a `GrammyError` with `description`, `error_code`, plus
 * stamping the description into `error.message`. We check both shapes.
 */
export function isParseEntitiesError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { description?: unknown; message?: unknown; error_code?: unknown };
  const desc =
    (typeof e.description === "string" && e.description) ||
    (typeof e.message === "string" && e.message) ||
    "";
  if (!desc) return false;
  // Telegram is consistent about the phrase; case-insensitive guard for safety.
  return /can't parse entities/i.test(desc);
}

/** Minimal shape we depend on from grammy's sendMessage — keeps tests light. */
type SendMessageFn = (
  chatId: number,
  text: string,
  other?: Record<string, unknown>
) => Promise<{ message_id: number }>;

export interface SafeSendOptions {
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML";
  reply_markup?: unknown;
  // Allow future grammy options to pass through without code change.
  [key: string]: unknown;
}

/**
 * Send a Telegram message with a "parse-mode fallback" safety net.
 *
 * If Telegram rejects the initial send with a `can't parse entities`
 * error (malformed Markdown), we retry the SAME body with `parse_mode`
 * cleared so the user still gets the brief as plain UTF-8. Any other
 * error re-throws.
 *
 * Logs a single warn line with the offset (parsed out of the description
 * when present) so Faeez can grep `[telegram:parse-fallback]` to track
 * how often it triggers without exposing message contents.
 *
 * @param send       The function to invoke (`bot.api.sendMessage` in prod,
 *                   a mock in tests).
 * @param chatId     Telegram chat id.
 * @param text       Message body.
 * @param options    Original send options (parse_mode, reply_markup, ...).
 */
export async function safeSendTelegramMessage(
  send: SendMessageFn,
  chatId: number,
  text: string,
  options: SafeSendOptions = {}
): Promise<{ message_id: number }> {
  try {
    return await send(chatId, text, options);
  } catch (err) {
    if (!isParseEntitiesError(err)) throw err;
    // Pull the byte offset out of the description for diagnostics — never
    // log the message body itself (privacy).
    const desc =
      (err && typeof err === "object" && "description" in err
        ? String((err as { description?: unknown }).description ?? "")
        : err instanceof Error
          ? err.message
          : "") || "";
    const offsetMatch = desc.match(/byte offset (\d+)/i);
    const offset = offsetMatch ? offsetMatch[1] : "unknown";
    console.warn(
      `[telegram:parse-fallback] parse_mode=${String(options.parse_mode ?? "none")} ` +
        `offset=${offset} len=${text.length} — retrying as plain text`
    );
    // Strip parse_mode, keep everything else (e.g. reply_markup so the
    // inline keyboard still attaches on the final part).
    const { parse_mode: _drop, ...rest } = options;
    return await send(chatId, text, rest);
  }
}
