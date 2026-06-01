/**
 * Telegram Update dispatcher.
 *
 * We intentionally do NOT use grammY's middleware/composer — we want
 * cheap, branch-free dispatch we can reason about with tests. Updates
 * arrive as raw JSON; we pattern-match `update.message.text` and
 * branch.
 *
 * Currently supports:
 *  - `/start <token>` -> link account (T-203)
 *  - `/start` (no arg) -> greet + instruct to link from web
 *
 * Future:
 *  - `/status`, `/pause`, `/resume`, free-text feedback
 */
import { resolveAndLinkToken } from "./link-token";
import { getBot } from "./client";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

const MSG_LINKED = (firstName?: string) =>
  `Hi${firstName ? ` ${firstName}` : ""}! Your Cadence account is linked. ` +
  `You'll start receiving briefs on your configured cadence. Reply with feedback ` +
  `anytime — Cadence learns from every nudge.`;

const MSG_TOKEN_INVALID =
  "That link expired or was already used. Open Cadence in your browser, " +
  "go to Settings -> Telegram, and tap 'Link Telegram' again.";

const MSG_START_NO_TOKEN =
  "Welcome to Cadence. To link this chat to your account, open the Cadence " +
  "web app and tap 'Link Telegram' — it'll send you back here with a one-tap link.";

const MSG_UNKNOWN =
  "I don't understand that yet. Cadence currently delivers your scheduled briefs " +
  "and listens for feedback. Try /status soon.";

export async function dispatchTelegramUpdate(
  update: TelegramUpdate
): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const firstName = msg.from?.first_name;
  const username = msg.from?.username ?? null;

  // /start <token>
  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    const token = parts[1];

    if (!token) {
      await safeSend(chatId, MSG_START_NO_TOKEN);
      return;
    }

    const res = await resolveAndLinkToken({
      token,
      telegramChatId: chatId,
      telegramUsername: username,
    });

    if (res.ok) {
      await safeSend(chatId, MSG_LINKED(firstName));
    } else {
      await safeSend(chatId, MSG_TOKEN_INVALID);
    }
    return;
  }

  // /status, /pause, /resume — stubs for next phase
  if (/^\/(status|pause|resume)\b/.test(text)) {
    await safeSend(chatId, "That command is coming in the next round. Hang tight.");
    return;
  }

  // Free-text — future: write into feedback_events / learning_log
  await safeSend(chatId, MSG_UNKNOWN);
}

async function safeSend(chatId: number, text: string): Promise<void> {
  try {
    const bot = getBot();
    await bot.api.sendMessage(chatId, text);
  } catch (err) {
    // Webhook must always 200 even if downstream send fails; log and move on.
    console.error("[telegram:sendMessage]", err);
  }
}
