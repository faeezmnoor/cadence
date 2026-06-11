/**
 * Founder bug report 2026-06-12 (FINDING-011): the ready-but-unconfirmed
 * draft state rendered three contradictory signals at once — "Your brief
 * is ready. Want to see it?", two disabled CTAs, and "Finish setting up
 * your brief in chat first." The panel now has exactly one voice per
 * state, resolved by this pure helper (vitest-pinned without jsdom):
 *
 *   - "hidden"  — draft incomplete; render nothing.
 *   - "confirm" — draft complete but not saved (the agent hasn't run
 *                 confirm_and_save). ONE live action: confirm the draft.
 *                 No preview/send affordances — they can't work yet.
 *   - "actions" — spec saved. Preview / send / link-Telegram, all enabled.
 *
 * This is the UX half of audit item B2 (design-audit/02 §4 — explicit,
 * user-controlled commit). The deterministic server-side save (not routed
 * through the agent's tool call) remains the hardening follow-up.
 */
export type BriefActionsState = "hidden" | "confirm" | "actions";

export function briefActionsState(input: {
  ready: boolean;
  saved: boolean;
}): BriefActionsState {
  if (!input.ready) return "hidden";
  return input.saved ? "actions" : "confirm";
}
