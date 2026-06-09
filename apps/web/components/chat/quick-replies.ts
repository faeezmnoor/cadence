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

const MAX_CHIPS = 4;

/**
 * Wave 4 Bug 4 fix: when `suggest_quick_replies.chips` or
 * `ask_user.suggestions` carry raw spec enum values (e.g. the LLM emits
 * `["executive_brief","analyst_deep_dive"]` for tone_preset, or `"en"` for
 * language), users see engineer-shaped strings in the UI. Map every known
 * DigestSpec enum value to a human label here. Anything that doesn't match
 * is passed through untouched — free-form chips (topic suggestions,
 * day-of-week names, etc.) stay verbatim.
 */
export const CHIP_ENUM_LABELS: Record<string, string> = {
  // tone_preset
  executive_brief: "Executive brief",
  analyst_deep_dive: "Analyst deep-dive",
  trader_quick_take: "Trader quick take",
  casual_newsletter: "Casual newsletter",
  // length_target
  short: "Short",
  medium: "Medium",
  long: "Long",
  // language
  en: "English",
  ms: "Bahasa Malaysia",
  zh: "中文",
  // cadence.frequency
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
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
