/**
 * Founder bug report 2026-06-12 (FINDING-011): the ready-but-unconfirmed
 * draft state rendered three contradictory signals at once — "Your brief
 * is ready. Want to see it?", two disabled CTAs, and "Finish setting up
 * your brief in chat first." The panel now has exactly one voice per
 * state, resolved by this pure helper (vitest-pinned without jsdom):
 *
 *   - "hidden"    — draft incomplete; render nothing.
 *   - "confirm"   — draft complete but not saved (the agent hasn't run
 *                   confirm_and_save). ONE live action: confirm the draft.
 *                   No preview/send affordances — they can't work yet.
 *   - "actions"   — spec saved, nothing staged. Preview / send /
 *                   link-Telegram, all enabled.
 *   - "reconfirm" — manage mode (plan §3.5, resolution C1): spec saved AND
 *                   edits are staged on the draft. ONE live action: confirm
 *                   the update. No preview/send affordances — sampling a
 *                   half-edited brief is the same pre-save disabled-button
 *                   bug class FINDING-011 closed.
 *
 * The three original truth-table rows are byte-identical in behavior;
 * `pendingChanges` defaults to false so every existing call site resolves
 * exactly as before. This is the UX half of audit item B2 (design-audit/02
 * §4 — explicit, user-controlled commit). The deterministic server-side
 * save (not routed through the agent's tool call) remains the hardening
 * follow-up.
 */
import type { Message } from "ai";

export type BriefActionsState = "hidden" | "confirm" | "actions" | "reconfirm";

export function briefActionsState(input: {
  ready: boolean;
  saved: boolean;
  /**
   * Manage mode: `specDiff(savedSpec, draftSpec).length > 0` (plan C7).
   * Optional so the pre-manage truth table stays byte-identical.
   */
  pendingChanges?: boolean;
}): BriefActionsState {
  if (!input.ready) return "hidden";
  if (!input.saved) return "confirm";
  return input.pendingChanges ? "reconfirm" : "actions";
}

/* ------------------------------------------------------------------ */
/* savedSpecId resolution (manage-mode plan §4.6, exec advisory 12)    */
/* ------------------------------------------------------------------ */

/**
 * Tool results that carry a persisted spec id. `save_changes` returns the
 * same `{spec_id, version}` shape as `confirm_and_save` by contract
 * (manage-mode plan §4.3.3) so one scan recognizes both.
 */
const SAVE_RESULT_TOOLS = new Set(["confirm_and_save", "save_changes"]);

/**
 * Latest persisted spec id visible in the transcript, scanning from the
 * end (dogfood-bugs 2026-06-09 behavior, extended to `save_changes`).
 */
export function scanSavedSpecId(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "assistant") continue;
    const tool = m.toolInvocations?.find(
      (t) => SAVE_RESULT_TOOLS.has(t.toolName) && t.state === "result"
    );
    if (tool && tool.state === "result") {
      const r = tool.result as { spec_id?: string } | undefined;
      return typeof r?.spec_id === "string" ? r.spec_id : null;
    }
  }
  return null;
}

/**
 * Precedence rule (exec advisory 12): the thread-bound `initialSavedSpecId`
 * (= chat_threads.spec_id, server-authoritative) beats any tool result
 * lingering in transcript history. CAD-212 path: `confirm_and_save` under
 * the cap hands `is_current` to a NEW spec without archiving the old one,
 * so a reused/legacy thread's history can contain a result pointing at a
 * DIFFERENT spec than the thread's binding — the binding must win. Within
 * a live setup session (no binding yet) the fresh tool result still drives
 * the panel exactly as shipped.
 */
export function resolveSavedSpecId(
  initialSavedSpecId: string | null | undefined,
  messages: Message[]
): string | null {
  return initialSavedSpecId ?? scanSavedSpecId(messages);
}

/* ------------------------------------------------------------------ */
/* Panel yield rule (manage-mode plan §3.1 item 4, Design risk 2)      */
/* ------------------------------------------------------------------ */

export interface PanelYieldItem {
  role: "user" | "assistant";
  /** True when this assistant turn carries a confirm_and_save or
   *  save_changes result — the panel's triggering save event. */
  saveEvent: boolean;
}

/**
 * The post-save `actions` panel renders only while no USER message exists
 * after the message carrying its triggering save event; once the user
 * sends any manage-mode message, the panel yields for that event (chips
 * and conversational asks remain the path back). A transcript with no
 * save event at all (lazy-created / reactivated manage threads) treats
 * the thread start as the event, so the panel shows until the user's
 * first message of the session. Pure derivation from message order — no
 * state change. Manage mode only; the setup `confirm`/`actions` flow is
 * untouched.
 */
export function panelYielded(items: PanelYieldItem[]): boolean {
  let lastSave = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.saveEvent) lastSave = i;
  }
  for (let i = lastSave + 1; i < items.length; i++) {
    if (items[i]!.role === "user") return true;
  }
  return false;
}
