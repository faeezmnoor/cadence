/**
 * Design-review 2026-06-11 FINDING-001: collapsible desktop spec rail.
 *
 * Pins the pure open-state logic (no jsdom in this suite — the component
 * itself is covered by the helpers it delegates to):
 *   - "Channel" never counts as captured content (it is always Telegram
 *     in the MVP, so an otherwise-empty draft must read as empty),
 *   - manual toggle beats automatic behaviour in every combination,
 *   - with no manual preference the rail opens exactly when content exists.
 */
import { describe, expect, it } from "vitest";
import {
  buildRows,
  hasDraftContent,
  resolveRailOpen,
} from "@/components/chat/spec-sidebar.helpers";

describe("spec rail: hasDraftContent", () => {
  it("is false for a null draft even though Channel is always set", () => {
    const rows = buildRows(null);
    expect(rows.find((r) => r.label === "Channel")?.value).toBe("Telegram");
    expect(hasDraftContent(rows)).toBe(false);
  });

  it("is true once any real field is captured", () => {
    expect(hasDraftContent(buildRows({ topics: ["palm oil"] }))).toBe(true);
    expect(
      hasDraftContent(
        buildRows({
          cadence: { frequency: "daily", delivery_time_local: "07:30" },
        })
      )
    ).toBe(true);
    expect(hasDraftContent(buildRows({ language: "en" }))).toBe(true);
  });
});

describe("spec rail: resolveRailOpen", () => {
  it("follows content when there is no manual preference", () => {
    expect(resolveRailOpen(null, false)).toBe(false);
    expect(resolveRailOpen(null, true)).toBe(true);
  });

  it("manual preference always wins", () => {
    expect(resolveRailOpen(true, false)).toBe(true);
    expect(resolveRailOpen(false, true)).toBe(false);
    expect(resolveRailOpen(true, true)).toBe(true);
    expect(resolveRailOpen(false, false)).toBe(false);
  });
});
