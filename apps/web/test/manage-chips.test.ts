/**
 * resolveChips — the deterministic quick-reply decision matrix
 * (manage-mode plan C5 / §3.1 / §3.6).
 *
 * Chips were the flaky surface (dogfood 2026-06-09: the model often skips
 * suggest_quick_replies). The fix is structural: ONE pure decision per
 * turn, so the manage capabilities tour can never go missing — and the
 * suppression rules (confirm/reconfirm panels own their moment; archived
 * briefs render no chips; never a chip that can't work) are pinned here
 * instead of living as render-condition folklore.
 */
import { describe, expect, it } from "vitest";
import {
  MANAGE_CHIP_CHANGE,
  MANAGE_CHIP_PREVIEW,
  MANAGE_CHIP_SEND,
  resolveChips,
} from "@/components/chat/quick-replies";

const base = {
  manage: true,
  archived: false,
  panelState: "actions" as const,
  lastRole: "assistant" as const,
  modelChips: [] as string[],
  telegramLinked: true,
};

describe("resolveChips — manage mode", () => {
  it("fallback set when the model suggested nothing and the last turn is the assistant's (linked)", () => {
    expect(resolveChips(base)).toEqual([
      MANAGE_CHIP_PREVIEW,
      MANAGE_CHIP_SEND,
      MANAGE_CHIP_CHANGE,
    ]);
  });

  it("unlinked drops 'Send one to Telegram' — never render a chip that can't work (§3.1)", () => {
    expect(resolveChips({ ...base, telegramLinked: false })).toEqual([
      MANAGE_CHIP_PREVIEW,
      MANAGE_CHIP_CHANGE,
    ]);
  });

  it("model-suggested chips take precedence over the fallback (C5)", () => {
    expect(resolveChips({ ...base, modelChips: ["Make it weekly"] })).toEqual([
      "Make it weekly",
    ]);
  });

  it("suppressed while the reconfirm panel owns the moment (§3.5 — one voice per state)", () => {
    expect(resolveChips({ ...base, panelState: "reconfirm" })).toEqual([]);
    expect(
      resolveChips({
        ...base,
        panelState: "reconfirm",
        modelChips: ["Make it weekly"],
      })
    ).toEqual([]);
  });

  it("suppressed on archived briefs — even over model chips (§3.6)", () => {
    expect(resolveChips({ ...base, archived: true })).toEqual([]);
    expect(
      resolveChips({ ...base, archived: true, modelChips: ["Preview"] })
    ).toEqual([]);
  });

  it("no fallback while the user has the floor (last message is the user's) or on an empty transcript", () => {
    expect(resolveChips({ ...base, lastRole: "user" })).toEqual([]);
    expect(resolveChips({ ...base, lastRole: null })).toEqual([]);
  });
});

describe("resolveChips — setup mode stays byte-identical to shipped behavior", () => {
  const setup = { ...base, manage: false };

  it("model chips or nothing — no deterministic fallback in setup", () => {
    expect(resolveChips(setup)).toEqual([]);
    expect(resolveChips({ ...setup, modelChips: ["Daily", "Weekly"] })).toEqual([
      "Daily",
      "Weekly",
    ]);
  });

  it("suppressed while the confirm panel owns the moment (designer audit P2)", () => {
    expect(
      resolveChips({
        ...setup,
        panelState: "confirm",
        modelChips: ["Daily"],
      })
    ).toEqual([]);
  });
});
