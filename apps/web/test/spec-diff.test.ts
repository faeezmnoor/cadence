/**
 * specDiff — manage-mode pending-change derivation (plan §3.4 / C7).
 *
 * Row-level diff between the SAVED spec and the STAGED draft in DISPLAY
 * terms: both sides run through the same `buildRows` projection the rail
 * renders, so the warning dot + "was …" captions can never disagree with
 * what the rail shows. `pendingChanges` (the resolver's reconfirm input)
 * is `specDiff(saved, staged).length > 0`.
 */
import { describe, expect, it } from "vitest";
import { specDiff } from "@/components/chat/spec-sidebar.helpers";

const savedSpec = {
  topics: ["palm oil"],
  entities: { companies: ["Sime Darby"] },
  cadence: {
    frequency: "daily",
    delivery_time_local: "07:00",
    days_of_week: [1, 2, 3, 4, 5],
  },
  language: "en",
};

describe("specDiff", () => {
  it("identical saved/staged → no pending rows (actions state)", () => {
    expect(specDiff(savedSpec, structuredClone(savedSpec))).toEqual([]);
  });

  it("no staged draft → no diff — abandoned edits live only in draftSpec (AC3.4)", () => {
    expect(specDiff(savedSpec, null)).toEqual([]);
    expect(specDiff(savedSpec, undefined as unknown as null)).toEqual([]);
  });

  it("single-field edit → exactly one row with value + was, in display terms", () => {
    const staged = structuredClone(savedSpec);
    staged.cadence.delivery_time_local = "08:00";
    const rows = specDiff(savedSpec, staged);
    expect(rows).toEqual([
      { label: "Delivery time", value: "08:00", was: "07:00" },
    ]);
  });

  it("multi-field edit → one row per changed display row", () => {
    const staged = structuredClone(savedSpec);
    staged.topics = ["cocoa"];
    staged.cadence.frequency = "weekly";
    const rows = specDiff(savedSpec, staged);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Topic");
    expect(labels).toContain("Schedule");
    expect(labels).not.toContain("Delivery time");
    const topic = rows.find((r) => r.label === "Topic");
    expect(topic?.value).toBe("cocoa");
    expect(topic?.was).toBe("palm oil");
  });

  it("a staged removal still produces a row — new value null, old value in `was`", () => {
    const staged = structuredClone(savedSpec) as Record<string, unknown>;
    delete staged.entities;
    const rows = specDiff(savedSpec, staged);
    const spec = rows.find((r) => r.label === "Specificity");
    expect(spec).toBeDefined();
    expect(spec?.value).toBeNull();
    expect(spec?.was).toContain("Sime Darby");
  });

  it("saved baseline null (defensive) → every staged display value reads as a change", () => {
    const rows = specDiff(null, { topics: ["palm oil"] });
    const topic = rows.find((r) => r.label === "Topic");
    expect(topic).toEqual({ label: "Topic", value: "palm oil", was: null });
    // Channel is constant ("Telegram" both sides) — never flagged.
    expect(rows.find((r) => r.label === "Channel")).toBeUndefined();
  });
});
