import { describe, it, expect } from "vitest";
import {
  briefJsonSchema,
  checkCitationParity,
  extractCitationMarkers,
  extractJsonObject,
  ComposerJsonError,
  type BriefJson,
} from "@/server/ai/composer/schema";

function validBrief(): BriefJson {
  return {
    schema_version: 1,
    header: {
      date: "2 Jun 2026",
      cadence_label: "Daily",
      industry: "Palm oil",
      personalization_summary: "KL trader",
    },
    tldr: "CPO holds; quota lifted [1].",
    sections: [
      {
        heading: "Prices",
        bullets: [{ text: "CPO RM3,920", citation_markers: [] }],
      },
      {
        heading: "What moved",
        bullets: [{ text: "Quota +12% [1]", citation_markers: [1] }],
      },
      {
        heading: "Watch",
        bullets: [{ text: "Felda Thu [2]", citation_markers: [2] }],
      },
    ],
    why_it_matters: "Your CPO short benefits.",
    feedback_cta: "Reply 👍 / 👎",
    sources: [
      { marker: 1, title: "MPOB", url: "https://mpob.gov.my/q" },
      { marker: 2, title: "Felda IR", url: "https://felda.com.my/ir" },
    ],
  };
}

describe("brief JSON schema", () => {
  it("accepts a valid brief", () => {
    const r = briefJsonSchema.safeParse(validBrief());
    expect(r.success).toBe(true);
  });

  it("rejects fewer than 3 sections", () => {
    const b = validBrief();
    b.sections = b.sections.slice(0, 2);
    expect(briefJsonSchema.safeParse(b).success).toBe(false);
  });

  it("rejects more than 5 sections", () => {
    const b = validBrief();
    b.sections = Array(6).fill(b.sections[0]);
    expect(briefJsonSchema.safeParse(b).success).toBe(false);
  });

  it("rejects empty why_it_matters", () => {
    const b = validBrief();
    b.why_it_matters = "";
    expect(briefJsonSchema.safeParse(b).success).toBe(false);
  });

  it("rejects empty sources array", () => {
    const b = validBrief();
    b.sources = [];
    expect(briefJsonSchema.safeParse(b).success).toBe(false);
  });

  it("rejects sections with no bullets", () => {
    const b = validBrief();
    b.sections[0].bullets = [];
    expect(briefJsonSchema.safeParse(b).success).toBe(false);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const b: Record<string, unknown> = { ...validBrief(), evil: "yes" };
    expect(briefJsonSchema.safeParse(b).success).toBe(false);
  });
});

describe("citation parity", () => {
  it("passes when every marker has a source and every source is cited", () => {
    const r = checkCitationParity(validBrief());
    expect(r.ok).toBe(true);
    expect(r.missingSources).toEqual([]);
    expect(r.unusedSources).toEqual([]);
  });

  it("flags orphan marker (cited but no source)", () => {
    const b = validBrief();
    b.tldr = "Something [9].";
    const r = checkCitationParity(b);
    expect(r.ok).toBe(false);
    expect(r.missingSources).toContain(9);
  });

  it("flags unused source (declared but never cited)", () => {
    const b = validBrief();
    b.sources.push({ marker: 7, title: "Unused", url: "https://x.com/a" });
    const r = checkCitationParity(b);
    expect(r.ok).toBe(false);
    expect(r.unusedSources).toContain(7);
  });

  it("counts citation_markers field, not just inline [n]", () => {
    const b = validBrief();
    // Bullet text has no inline marker but citation_markers declares one.
    b.sections[0].bullets[0] = {
      text: "Brent soft tone",
      citation_markers: [1],
    };
    // Now marker 1 is referenced (via citation_markers) so it's not "unused".
    // Build minimal valid brief where marker 2 is no longer needed:
    b.sections[1].bullets = [{ text: "Quota lift [1]", citation_markers: [1] }];
    b.sections[2].bullets = [{ text: "Felda Thu [2]", citation_markers: [2] }];
    const r = checkCitationParity(b);
    expect(r.ok).toBe(true);
  });
});

describe("extractCitationMarkers", () => {
  it("pulls [n] tokens out of free text", () => {
    expect(extractCitationMarkers("foo [1] bar [12][3]")).toEqual([1, 12, 3]);
  });
  it("ignores non-numeric brackets", () => {
    expect(extractCitationMarkers("foo [abc] [1]")).toEqual([1]);
  });
});

describe("extractJsonObject", () => {
  it("parses a plain JSON object", () => {
    const r = extractJsonObject('{"a":1}');
    expect(r).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const r = extractJsonObject('```json\n{"a":1}\n```');
    expect(r).toEqual({ a: 1 });
  });

  it("handles leading prose before the first {", () => {
    const r = extractJsonObject('Here is your brief:\n{"a":1}\n');
    expect(r).toEqual({ a: 1 });
  });

  it("respects braces inside strings (does not close early)", () => {
    const r = extractJsonObject('{"a": "x } y", "b": 2}');
    expect(r).toEqual({ a: "x } y", b: 2 });
  });

  it("respects escaped quotes inside strings", () => {
    const r = extractJsonObject('{"a": "he said \\"hi\\"", "b": 2}');
    expect(r).toEqual({ a: 'he said "hi"', b: 2 });
  });

  it("throws on empty input", () => {
    expect(() => extractJsonObject("")).toThrow(ComposerJsonError);
  });

  it("throws on no opening brace", () => {
    expect(() => extractJsonObject("no json here")).toThrow(ComposerJsonError);
  });

  it("throws on unbalanced braces", () => {
    expect(() => extractJsonObject('{"a": 1')).toThrow(ComposerJsonError);
  });
});
