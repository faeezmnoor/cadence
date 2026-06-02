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
import { recordFeedbackCallback } from "./feedback-callback";
import { parseCallbackData, VOTE_TOAST } from "./keyboard";
import {
  parseTuneCommand,
  handleTuneCommand,
  buildAckReply,
  TUNE_REPLIES,
} from "./tune-command";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number; type: string };
    };
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
  // T-402 (CAD-43): handle inline-keyboard taps. Telegram gives us 5s to
  // answerCallbackQuery before the spinner times out on the user's screen,
  // so we keep the DB write tight and answer inline. answerCallbackQuery
  // is best-effort — even if it errors we don't surface to the webhook.
  if (update.callback_query) {
    await dispatchCallbackQuery(update.callback_query);
    return;
  }

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

  // /tune <freeform> — standing instruction → learning_log (T-403 / CAD-44).
  // Parse before the /status stub so /tune doesn't fall through to MSG_UNKNOWN.
  const tuneArg = parseTuneCommand(text);
  if (tuneArg !== null) {
    if (tuneArg === "") {
      await safeSend(chatId, TUNE_REPLIES.usage);
      return;
    }
    const res = await handleTuneCommand({ telegramChatId: chatId, rawText: tuneArg });
    switch (res.kind) {
      case "logged":
        await safeSend(chatId, buildAckReply(tuneArg));
        return;
      case "empty":
        // Defensive — parseTuneCommand already guards this branch.
        await safeSend(chatId, TUNE_REPLIES.usage);
        return;
      case "unknown_user":
        await safeSend(chatId, TUNE_REPLIES.unlinked);
        return;
    }
  }

  // /status, /pause, /resume — stubs for next phase
  if (/^\/(status|pause|resume)\b/.test(text)) {
    await safeSend(chatId, "That command is coming in the next round. Hang tight.");
    return;
  }

  // Free-text — future: write into feedback_events / learning_log
  await safeSend(chatId, MSG_UNKNOWN);
}

type CallbackQuery = NonNullable<TelegramUpdate["callback_query"]>;

async function dispatchCallbackQuery(cb: CallbackQuery): Promise<void> {
  const parsed = parseCallbackData(cb.data);
  if (!parsed) {
    // Unknown callback shape — still answer Telegram so the spinner stops.
    await safeAnswerCallback(cb.id, "Unknown action — try /tune.");
    return;
  }

  const result = await recordFeedbackCallback({
    callbackId: cb.id,
    telegramUserId: cb.from.id,
    telegramChatId: cb.message?.chat.id ?? null,
    runId: parsed.runId,
    vote: parsed.vote,
  });

  // Always answer — even on duplicate / unknown user — so the user's UI
  // doesn't hang spinning. We pick the toast text based on outcome.
  let toast: string;
  switch (result.kind) {
    case "recorded":
    case "duplicate":
      toast = VOTE_TOAST[parsed.vote];
      break;
    case "unknown_user":
      toast = "Link this chat to Cadence in the web app first.";
      break;
    case "unknown_run":
      toast = "That brief is too old to react to. Try the next one.";
      break;
  }
  await safeAnswerCallback(cb.id, toast);
}

async function safeAnswerCallback(callbackId: string, text: string): Promise<void> {
  try {
    const bot = getBot();
    await bot.api.answerCallbackQuery(callbackId, { text });
  } catch (err) {
    console.error("[telegram:answerCallbackQuery]", err);
  }
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
