/**
 * Quick-reply chip selector — pure helper used by chat-client.tsx.
 *
 * Source priority on the latest assistant turn:
 *   1. `suggest_quick_replies.chips`  (preferred — purpose-built tool)
 *   2. `ask_user.suggestions`         (fallback — model often skips #1)
 *
 * History:
 *  - T-414 / CAD-74 introduced `suggest_quick_replies` as the dedicated
 *    chip source.
 *  - c059029 (Jun 5) removed the in-bubble `ask_user.suggestions` chip
 *    render to kill a dual-strip UX bug — leaving the below-bubble strip
 *    as the only source.
 *  - Dogfood 2026-06-09 surfaced that the model often skips
 *    `suggest_quick_replies` despite the prompt rule, so the strip
 *    disappeared entirely. Adding `ask_user.suggestions` as a fallback
 *    here keeps a single strip (no dual-render regression) but stops the
 *    chips going missing whenever the LLM misbehaves.
 */
import type { Message } from "ai";
import type { BriefActionsState } from "./brief-actions.helpers";
import {
  formatFrequency,
  formatLanguage,
  formatLength,
  formatTone,
} from "@/lib/labels";

const MAX_CHIPS = 4;

/**
 * Wave 4 Bug 4 + Wave 5 structural: chip enum labels now route through
 * the single-source-of-truth `lib/labels.ts` formatters. The exported
 * `CHIP_ENUM_LABELS` map is kept (as a derived view) for the existing
 * `wave4-bundled-regressions.test.ts` regression checks; new code should
 * import the `formatX` helpers directly.
 */
export const CHIP_ENUM_LABELS: Record<string, string> = {
  // tone_preset
  executive_brief: formatTone("executive_brief"),
  analyst_deep_dive: formatTone("analyst_deep_dive"),
  trader_quick_take: formatTone("trader_quick_take"),
  casual_newsletter: formatTone("casual_newsletter"),
  // length_target
  short: formatLength("short"),
  medium: formatLength("medium"),
  long: formatLength("long"),
  // language
  en: formatLanguage("en"),
  ms: formatLanguage("ms"),
  zh: formatLanguage("zh"),
  // cadence.frequency
  daily: formatFrequency("daily"),
  weekly: formatFrequency("weekly"),
  monthly: formatFrequency("monthly"),
};

export function prettifyChip(raw: string): string {
  const trimmed = raw.trim();
  // Case-sensitive match against the canonical enum table.
  if (Object.prototype.hasOwnProperty.call(CHIP_ENUM_LABELS, trimmed)) {
    return CHIP_ENUM_LABELS[trimmed]!;
  }
  // Defensive lowercase pass — covers "Executive_brief" / "EXECUTIVE_BRIEF"
  // style drift from the LLM.
  const lower = trimmed.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CHIP_ENUM_LABELS, lower)) {
    return CHIP_ENUM_LABELS[lower]!;
  }
  return trimmed;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string");
}

/* ------------------------------------------------------------------ */
/* Manage-mode chip set + deterministic fallback (plan C5 / §3.1)      */
/* ------------------------------------------------------------------ */

export const MANAGE_CHIP_PREVIEW = "Preview a sample";
export const MANAGE_CHIP_SEND = "Send one to Telegram";
export const MANAGE_CHIP_CHANGE = "Change something";

/**
 * The single chip-strip decision for a turn — pure so vitest can pin the
 * matrix (deterministic by construction; no model compliance involved).
 *
 *  - Archived briefs render NO chips (plan §3.6).
 *  - While the confirm/reconfirm panel owns the moment, the strip is
 *    suppressed (designer audit P2 + §3.5 — one voice per decision).
 *  - Model-suggested chips, when emitted, take precedence (C5).
 *  - Manage fallback: when the last transcript item is an assistant
 *    message and the model suggested nothing, render the static manage
 *    set. "Send one to Telegram" only when linked — never render a chip
 *    that can't work (§3.1).
 *  - Setup mode keeps its shipped behavior: model chips or nothing.
 */
export function resolveChips(args: {
  manage: boolean;
  archived: boolean;
  panelState: BriefActionsState;
  lastRole: "user" | "assistant" | null;
  modelChips: string[];
  telegramLinked: boolean;
}): string[] {
  if (args.archived) return [];
  if (args.panelState === "confirm" || args.panelState === "reconfirm") {
    return [];
  }
  if (args.modelChips.length > 0) return args.modelChips;
  if (!args.manage) return [];
  if (args.lastRole !== "assistant") return [];
  return args.telegramLinked
    ? [MANAGE_CHIP_PREVIEW, MANAGE_CHIP_SEND, MANAGE_CHIP_CHANGE]
    : [MANAGE_CHIP_PREVIEW, MANAGE_CHIP_CHANGE];
}

export function pickLatestQuickReplies(messages: Message[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") return [];
    if (m.role !== "assistant") continue;

    const sqr = m.toolInvocations?.find(
      (t) => t.toolName === "suggest_quick_replies" && t.state === "result"
    );
    if (sqr && sqr.state === "result") {
      const r = sqr.result as { chips?: unknown } | undefined;
      return asStringArray(r?.chips).slice(0, MAX_CHIPS).map(prettifyChip);
    }

    const ask = m.toolInvocations?.find(
      (t) => t.toolName === "ask_user" && t.state === "result"
    );
    if (ask && ask.state === "result") {
      const r = ask.result as { suggestions?: unknown } | undefined;
      return asStringArray(r?.suggestions).slice(0, MAX_CHIPS).map(prettifyChip);
    }

    return [];
  }
  return [];
}
