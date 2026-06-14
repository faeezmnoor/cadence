/**
 * FINDING-011 (founder bug report 2026-06-12): the ready-but-unconfirmed
 * draft state rendered contradictory signals — "Your brief is ready" +
 * two disabled CTAs + "Finish setting up your brief in chat first."
 *
 * Pins the pure state resolver so the panel can only ever be in one of
 * three coherent states, and the confirm state exists exactly when the
 * draft is complete but unsaved (audit design-audit/02 §4 / item B2).
 */
import { describe, expect, it } from "vitest";
import { briefActionsState } from "@/components/chat/brief-actions.helpers";

describe("brief actions: state resolver", () => {
  it("hidden while the draft is incomplete, regardless of saved", () => {
    expect(briefActionsState({ ready: false, saved: false })).toBe("hidden");
    // Defensive: saved-but-not-ready shouldn't happen (saving requires a
    // complete draft), but if it does, showing nothing beats showing
    // actions for a spec the sidebar says is incomplete.
    expect(briefActionsState({ ready: false, saved: true })).toBe("hidden");
  });

  it("confirm exactly when complete but unsaved — the one-live-action state", () => {
    expect(briefActionsState({ ready: true, saved: false })).toBe("confirm");
  });

  it("actions only once the agent has persisted the spec", () => {
    expect(briefActionsState({ ready: true, saved: true })).toBe("actions");
  });
});

/**
 * Manage-mode wave (plan §3.5, resolution C1) — APPENDED rows only. The
 * three rows above are the PR #40/#42 behavioral freeze: they must never
 * be edited, and `pendingChanges` must default to false so every existing
 * call site resolves byte-identically.
 */
describe("brief actions: manage-mode reconfirm rows (appended, plan §3.5)", () => {
  it("pendingChanges omitted ≡ pendingChanges:false — legacy rows byte-identical", () => {
    expect(
      briefActionsState({ ready: false, saved: false, pendingChanges: false })
    ).toBe("hidden");
    expect(
      briefActionsState({ ready: false, saved: true, pendingChanges: false })
    ).toBe("hidden");
    expect(
      briefActionsState({ ready: true, saved: false, pendingChanges: false })
    ).toBe("confirm");
    expect(
      briefActionsState({ ready: true, saved: true, pendingChanges: false })
    ).toBe("actions");
  });

  it("saved && pendingChanges → reconfirm — the one-live-action update state", () => {
    expect(
      briefActionsState({ ready: true, saved: true, pendingChanges: true })
    ).toBe("reconfirm");
  });

  it("!ready wins over pendingChanges — a half-staged incomplete draft renders nothing", () => {
    expect(
      briefActionsState({ ready: false, saved: true, pendingChanges: true })
    ).toBe("hidden");
  });

  it("!saved && pendingChanges → confirm — staged edits without a saved target cannot reconfirm", () => {
    expect(
      briefActionsState({ ready: true, saved: false, pendingChanges: true })
    ).toBe("confirm");
  });
});
