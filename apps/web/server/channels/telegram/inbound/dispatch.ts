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
 *  - `/tune <freeform>` -> standing note (T-403 / CAD-44)
 *  - free-text reply to a delivered brief -> confirm-then-save (CAD-220)
 *
 * Future:
 *  - `/status`, `/pause`, `/resume`
 */
import { resolveAndLinkToken } from "./link-token";
import { getBot } from "../client";
import { telegramAdapter, formatPlainText } from "../index";
import { recordFeedbackCallback } from "./feedback-callback";
import { parseCallbackData, VOTE_TOAST } from "../keyboard";
import {
  parseTuneCommand,
  handleTuneCommand,
  buildAckReply,
  TUNE_REPLIES,
} from "./tune-command";
import {
  buildConfirmText,
  buildTuneNoteKeyboard,
  extractSnippetFromConfirmText,
  matchBriefReply,
  parseTuneNoteCallback,
  saveStandingNote,
  REPLY_CAPTURE_COPY,
  type TuneNoteDecision,
} from "./reply-capture";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    /** CAD-220: present when the user replied to an earlier message. */
    reply_to_message?: { message_id: number };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number; type: string };
      /** CAD-220: the confirm message's own text carries the pending note. */
      text?: string;
    };
  };
}

const MSG_LINKED = (firstName?: string) =>
  `Hey${firstName ? ` ${firstName}` : ""} — you're connected. ` +
  `Your first brief lands tomorrow morning. ` +
  // CAD-211 wired reactions; CAD-220 added reply capture (with confirm).
  `React 👍/👎 to any brief and I'll shape the next one around it.`;

const MSG_TOKEN_INVALID =
  "That link expired (they only last 15 minutes). " +
  "Head back to Cadence on the web and tap \"Connect Telegram\" again — " +
  "we'll send you a fresh one.";

const MSG_START_NO_TOKEN =
  "Hey 👋 you're in the right place. To finish connecting, head to cadence.news " +
  "on the web and tap \"Connect Telegram\" — we'll bring you back here with one tap.";

const MSG_UNKNOWN =
  "I deliver your briefs and read your reactions. " +
  "Tap 👍/👎 on any brief, or reply directly to a brief to tell me what to change.";

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
    await safeSend(chatId, "That command isn't ready yet — soon.");
    return;
  }

  // CAD-220: free-text reply to one of THIS user's delivered briefs →
  // confirm-before-save. Commands never reach here (handled above) and
  // anything slash-prefixed is excluded — only genuine free text qualifies.
  if (!text.startsWith("/") && msg.reply_to_message) {
    const match = await matchBriefReply({
      telegramChatId: chatId,
      replyToMessageId: msg.reply_to_message.message_id,
      text,
    });
    if (match.kind === "match") {
      // Send the confirm prompt with the [💾 Save] [Ignore] keyboard.
      // NOTHING is written to learning_log until the user taps Save.
      await safeSendConfirm(chatId, match.snippet);
      return;
    }
  }

  // Non-reply free text (or a reply we can't tie to a brief).
  await safeSend(chatId, MSG_UNKNOWN);
}

type CallbackQuery = NonNullable<TelegramUpdate["callback_query"]>;

async function dispatchCallbackQuery(cb: CallbackQuery): Promise<void> {
  // CAD-220: tn:yes / tn:no — confirm-keyboard taps for reply capture.
  // Parsed alongside the fb: votes; the two prefixes never overlap.
  const tuneNoteDecision = parseTuneNoteCallback(cb.data);
  if (tuneNoteDecision) {
    await dispatchTuneNoteCallback(cb, tuneNoteDecision);
    return;
  }

  const parsed = parseCallbackData(cb.data);
  if (!parsed) {
    // Unknown callback shape — still answer Telegram so the spinner stops.
    await safeAnswerCallback(cb.id, "Hmm, didn't catch that — try replying with what you'd change.");
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
      toast = "Connect this chat to Cadence on the web first.";
      break;
    case "unknown_run":
      toast = "That brief is too old to react to. Try the next one.";
      break;
  }
  await safeAnswerCallback(cb.id, toast);
}

/**
 * CAD-220: handle a [💾 Save] / [Ignore] tap on a reply-capture confirm
 * message. The pending note lives in the confirm message's own text —
 * Telegram is the storage, so the only DB touch is the final learning_log
 * insert on Save.
 */
async function dispatchTuneNoteCallback(
  cb: CallbackQuery,
  decision: TuneNoteDecision
): Promise<void> {
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;

  // Telegram omits `message` from callbacks on messages older than ~48h —
  // with it goes the candidate text, so there is nothing left to save.
  if (chatId === undefined || messageId === undefined) {
    await safeAnswerCallback(cb.id, REPLY_CAPTURE_COPY.toastExpired);
    return;
  }

  if (decision === "no") {
    await safeAnswerCallback(cb.id, REPLY_CAPTURE_COPY.toastIgnored);
    // Editing without reply_markup also clears the keyboard.
    await safeEditMessage(chatId, messageId, REPLY_CAPTURE_COPY.notSavedMessage);
    return;
  }

  const snippet = extractSnippetFromConfirmText(cb.message?.text);
  if (!snippet) {
    // Not our confirm shape (already resolved, or text missing).
    await safeAnswerCallback(cb.id, REPLY_CAPTURE_COPY.toastExpired);
    return;
  }

  const res = await saveStandingNote({
    telegramChatId: chatId,
    noteText: snippet,
  });
  switch (res.kind) {
    case "saved":
      await safeAnswerCallback(cb.id, REPLY_CAPTURE_COPY.toastSaved);
      await safeEditMessage(
        chatId,
        messageId,
        REPLY_CAPTURE_COPY.savedMessage(snippet)
      );
      return;
    case "unknown_user":
      await safeAnswerCallback(cb.id, REPLY_CAPTURE_COPY.toastUnlinked);
      return;
    case "empty":
      await safeAnswerCallback(cb.id, REPLY_CAPTURE_COPY.toastExpired);
      return;
  }
}

async function safeAnswerCallback(callbackId: string, text: string): Promise<void> {
  try {
    const bot = getBot();
    await bot.api.answerCallbackQuery(callbackId, { text });
  } catch (err) {
    console.error("[telegram:answerCallbackQuery]", err);
  }
}

/**
 * CAD-220: best-effort edit of a confirm message into its resolved form
 * (`💾 Saved: "…"` / `Not saved.`). Lives here because server/channels/
 * telegram/ is the sanctioned dir for raw bot-api calls (CAD-207); the
 * outbound-message guard targets sendMessage, and an edit is not a send.
 */
async function safeEditMessage(
  chatId: number,
  messageId: number,
  text: string
): Promise<void> {
  try {
    const bot = getBot();
    await bot.api.editMessageText(chatId, messageId, text);
  } catch (err) {
    console.error("[telegram:editMessageText]", err);
  }
}

/**
 * CAD-220: send the reply-capture confirm prompt with its [💾 Save]
 * [Ignore] inline keyboard. The confirm body (prompt + ≤180-char snippet)
 * is always a single part, far below the Telegram cap, but we still route
 * through the canonical splitter and attach the keyboard to the final part
 * so the invariant holds structurally.
 */
async function safeSendConfirm(chatId: number, snippet: string): Promise<void> {
  try {
    const parts = formatPlainText(buildConfirmText(snippet));
    for (let i = 0; i < parts.length; i++) {
      const part =
        i === parts.length - 1
          ? { ...parts[i]!, replyMarkup: buildTuneNoteKeyboard() }
          : parts[i]!;
      await telegramAdapter.send(part, { channel: "telegram", chatId });
    }
  } catch (err) {
    console.error("[telegram:sendMessage]", err);
  }
}

async function safeSend(chatId: number, text: string): Promise<void> {
  try {
    // Wave 5 Bug 15: formatPlainText routes through the canonical splitter
    // so a long callback-flow message (e.g. a multi-paragraph onboarding
    // nudge, future tour copy) can't exceed Telegram's 4096-char cap.
    for (const part of formatPlainText(text)) {
      await telegramAdapter.send(part, { channel: "telegram", chatId });
    }
  } catch (err) {
    // Webhook must always 200 even if downstream send fails; log and move on.
    console.error("[telegram:sendMessage]", err);
  }
}
