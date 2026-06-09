/**
 * Tests for the PRIOR CONTEXT system-prompt addendum (Workstream B).
 */
import { describe, expect, it } from "vitest";
import { buildPriorContextBlock } from "@/server/ai/config-agent/prior-context";
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";

describe("buildPriorContextBlock", () => {
  it("returns empty when nothing to say", () => {
    expect(buildPriorContextBlock(undefined, {}, {})).toBe("");
    expect(buildPriorContextBlock({ schema_version: 1 }, {}, {})).toBe("");
  });

  it("emits a draft snapshot when draft has meaningful fields", () => {
    const draft: DigestSpecDraft = {
      schema_version: 1,
      topics: ["crypto"],
      cadence: {
        frequency: "daily",
        delivery_time_local: "08:00",
        days_of_week: [1, 2, 3, 4, 5],
      },
    };
    const out = buildPriorContextBlock(draft, {}, {});
    expect(out).toContain("PRIOR CONTEXT");
    expect(out).toContain('"crypto"');
    expect(out).toContain('"frequency": "daily"');
    expect(out).not.toContain("schema_version");
  });

  it("calls out HIGH applied slots with confirm + chip-strip instructions", () => {
    const out = buildPriorContextBlock(
      undefined,
      { frequency: "weekly", topics: ["palm oil"] },
      {}
    );
    expect(out).toContain("Just applied");
    expect(out).toContain("suggest_quick_replies");
    expect(out).toContain('"frequency": "weekly"');
    expect(out).toContain('"palm oil"');
  });

  it("calls out MED proposed slots as not-applied-yet", () => {
    const out = buildPriorContextBlock(undefined, {}, { language: "ms" });
    expect(out).toContain("MEDIUM confidence");
    expect(out).toContain("NOT applied to the draft yet");
    expect(out).toContain('"language": "ms"');
  });

  it("combines all three sections when present", () => {
    const out = buildPriorContextBlock(
      { schema_version: 1, topics: ["crypto"] },
      { frequency: "daily" },
      { language: "ms" }
    );
    expect(out).toContain("Current draft");
    expect(out).toContain("Just applied");
    expect(out).toContain("MEDIUM confidence");
  });
});
