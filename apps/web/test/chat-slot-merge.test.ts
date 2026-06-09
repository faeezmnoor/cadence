/**
 * Unit tests for slot-precedence merge (blueprint §3.2).
 */
import { describe, expect, it } from "vitest";
import { mergeExtractedSlots } from "@/server/ai/config-agent/slot-merge";
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";
import type { ExtractedSlots } from "@/server/ai/config-agent/extract-schema";

const emptyDraft: DigestSpecDraft = { schema_version: 1 };

describe("mergeExtractedSlots — HIGH conf path", () => {
  it("applies a HIGH explicit slot to an empty draft", () => {
    const ext: ExtractedSlots = {
      frequency: { value: "weekly", confidence: 0.95, source: "explicit" },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.frequency).toBe("weekly");
    expect(r.draft.cadence?.frequency).toBe("weekly");
    // Cadence safety defaults filled in.
    expect(r.draft.cadence?.delivery_time_local).toBe("08:00");
    expect(r.draft.cadence?.days_of_week).toEqual([1, 2, 3, 4, 5]);
  });

  it("overwrites an existing inferred slot when new is explicit HIGH", () => {
    // Existing draft has cadence.frequency=daily (from prior inferred turn).
    const draft: DigestSpecDraft = {
      schema_version: 1,
      cadence: {
        frequency: "daily",
        delivery_time_local: "07:00",
        days_of_week: [1, 2, 3, 4, 5],
      },
    };
    const ext: ExtractedSlots = {
      frequency: { value: "weekly", confidence: 0.97, source: "explicit" },
    };
    const r = mergeExtractedSlots(draft, ext);
    expect(r.applied.frequency).toBe("weekly");
    expect(r.draft.cadence?.frequency).toBe("weekly");
    // Other cadence fields preserved.
    expect(r.draft.cadence?.delivery_time_local).toBe("07:00");
  });
});

describe("mergeExtractedSlots — inferred-never-overwrites rule", () => {
  it("drops an INFERRED guess when draft already has a value", () => {
    const draft: DigestSpecDraft = {
      schema_version: 1,
      cadence: {
        frequency: "daily",
        delivery_time_local: "08:00",
        days_of_week: [1, 2, 3, 4, 5],
      },
    };
    const ext: ExtractedSlots = {
      frequency: { value: "weekly", confidence: 0.95, source: "inferred" },
    };
    const r = mergeExtractedSlots(draft, ext);
    expect(r.applied.frequency).toBeUndefined();
    expect(r.dropped.frequency).toBe("weekly");
    expect(r.draft.cadence?.frequency).toBe("daily");
  });

  it("applies an INFERRED HIGH-conf slot when draft is empty", () => {
    const ext: ExtractedSlots = {
      tone_preset: {
        value: "executive_brief",
        confidence: 0.9,
        source: "inferred",
      },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.tone_preset).toBe("executive_brief");
  });
});

describe("mergeExtractedSlots — MED-conf proposes, LOW-conf drops", () => {
  it("proposes MED-conf slots without writing the draft", () => {
    const ext: ExtractedSlots = {
      frequency: { value: "weekly", confidence: 0.6, source: "explicit" },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.frequency).toBeUndefined();
    expect(r.proposed.frequency).toBe("weekly");
    expect(r.draft.cadence).toBeUndefined();
  });

  it("drops LOW-conf slots entirely", () => {
    const ext: ExtractedSlots = {
      frequency: { value: "weekly", confidence: 0.3, source: "explicit" },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.dropped.frequency).toBe("weekly");
    expect(r.applied.frequency).toBeUndefined();
    expect(r.proposed.frequency).toBeUndefined();
  });
});

describe("mergeExtractedSlots — industry → topics fallback", () => {
  it("uses industry as a single-topic seed when topics is absent", () => {
    const ext: ExtractedSlots = {
      industry: { value: "crypto", confidence: 0.95, source: "explicit" },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.topics).toEqual(["crypto"]);
    expect(r.draft.topics).toEqual(["crypto"]);
  });

  it("prefers explicit topics over industry when both present", () => {
    const ext: ExtractedSlots = {
      industry: { value: "crypto", confidence: 0.95, source: "explicit" },
      topics: {
        value: ["bitcoin price", "ethereum news"],
        confidence: 0.95,
        source: "explicit",
      },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.topics).toEqual(["bitcoin price", "ethereum news"]);
  });
});

describe("mergeExtractedSlots — language positioning guard", () => {
  it("auto-applies language=en", () => {
    const ext: ExtractedSlots = {
      language: { value: "en", confidence: 0.95, source: "explicit" },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.language).toBe("en");
  });

  it("NEVER auto-applies ms/zh (positioning honesty)", () => {
    const ext: ExtractedSlots = {
      language: { value: "ms", confidence: 0.99, source: "explicit" },
    };
    const r = mergeExtractedSlots(emptyDraft, ext);
    expect(r.applied.language).toBeUndefined();
    expect(r.proposed.language).toBe("ms");
    expect(r.draft.language).toBeUndefined();
  });
});

describe("mergeExtractedSlots — mid-flow correction", () => {
  it("catches 'actually weekly not daily' style corrections", () => {
    // Draft built up from prior inferred/explicit turn.
    const draft: DigestSpecDraft = {
      schema_version: 1,
      cadence: {
        frequency: "daily",
        delivery_time_local: "08:00",
        days_of_week: [1, 2, 3, 4, 5],
      },
    };
    // User says "actually weekly not daily" → extractor marks explicit.
    const ext: ExtractedSlots = {
      frequency: { value: "weekly", confidence: 0.97, source: "explicit" },
    };
    const r = mergeExtractedSlots(draft, ext);
    expect(r.applied.frequency).toBe("weekly");
    expect(r.draft.cadence?.frequency).toBe("weekly");
  });
});
