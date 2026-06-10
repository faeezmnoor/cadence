/**
 * Telegram channel adapter (CAD-205).
 *
 * Thin wrapper over the existing `server/telegram/format.ts` (splitter) and
 * `server/telegram/client.ts` (safe-send + parse-mode fallback). This file
 * exists so business logic can depend on the channel-agnostic
 * `ChannelAdapter` interface instead of importing grammY symbols directly.
 *
 * The legacy `server/telegram/*` modules remain in place and continue to
 * back this adapter — no callsite churn in PR #12. Future PRs (#12b...) will
 * migrate the remaining direct callers to depend on this module only and
 * collapse the legacy directory.
 */
import {
  CADENCE_PART_CAP,
  TELEGRAM_HARD_CAP,
  formatComposerOutput,
  splitForTelegram,
} from "@/server/telegram/format";
import {
  getBot,
  isTelegramConfigured,
  safeSendTelegramMessage,
} from "@/server/telegram/client";
import type {
  ChannelAdapter,
  ChannelInvariants,
  ChannelTarget,
  ComposedBrief,
  FormatOptions,
} from "../types";

export interface TelegramPart {
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  replyMarkup?: unknown;
}

export interface TelegramTarget extends ChannelTarget {
  channel: "telegram";
  chatId: number;
}

export interface TelegramReceipt {
  messageId: number;
}

export const TELEGRAM_INVARIANTS: ChannelInvariants = {
  hardCap: TELEGRAM_HARD_CAP,
  softCap: CADENCE_PART_CAP,
  label: "Telegram",
};

/**
 * Pure formatter. Takes channel-agnostic `ComposedBrief`, returns N parts
 * each <= soft cap, ready for `send()`.
 *
 * Reuses the canonical `formatComposerOutput` splitter so behavior matches
 * what `digest/run.ts` ships today byte-for-byte. The optional
 * `withFeedbackAffordances` flag is honored downstream (the keyboard is
 * attached on the final part by the caller via `replyMarkup`), not here —
 * `format()` stays pure.
 */
function format(brief: ComposedBrief, _opts: FormatOptions = {}): TelegramPart[] {
  const formatted = formatComposerOutput(brief.markdown);
  return formatted.map((m) => ({
    text: m.text,
    parseMode: m.parseMode === undefined ? undefined : m.parseMode,
  }));
}

/**
 * Send one part to Telegram. The only sanctioned vendor-SDK callsite for
 * the Telegram channel — see `channel-adapter-architecture.md` §Enforcement.
 *
 * Routes through `safeSendTelegramMessage` so the parse-mode fallback
 * (Wave 5 Bug 12 / Telegram "can't parse entities") keeps applying.
 */
async function send(
  part: TelegramPart,
  target: TelegramTarget
): Promise<TelegramReceipt> {
  if (!isTelegramConfigured()) {
    throw new Error(
      "Telegram is not configured — TELEGRAM_BOT_TOKEN missing. " +
        "Adapter.send() requires a live bot."
    );
  }
  const bot = getBot();
  const options: Record<string, unknown> = {};
  if (part.parseMode) options.parse_mode = part.parseMode;
  if (part.replyMarkup !== undefined) options.reply_markup = part.replyMarkup;

  const result = await safeSendTelegramMessage(
    (cid, txt, other) =>
      bot.api.sendMessage(
        cid,
        txt,
        other as Parameters<typeof bot.api.sendMessage>[2]
      ),
    target.chatId,
    part.text,
    options
  );
  return { messageId: result.message_id };
}

function partText(part: TelegramPart): string {
  return part.text;
}

export const telegramAdapter: ChannelAdapter<
  TelegramPart,
  TelegramTarget,
  TelegramReceipt
> = {
  channel: "telegram",
  invariants: TELEGRAM_INVARIANTS,
  format,
  send,
  partText,
};

/**
 * Re-export the legacy split helper so callers depending on the adapter
 * package can avoid reaching into `server/telegram/format.ts` directly.
 */
export { splitForTelegram };
