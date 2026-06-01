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
