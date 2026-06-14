/**
 * CAD-226 grounding fix 1 — dedupe sources by URL.
 * The informed-judge eval penalized briefs citing the same URL twice;
 * dedupeBriefSourcesByUrl merges them deterministically with no content
 * loss and consistent marker renumbering.
 */
import { describe, it, expect } from "vitest";
import {
  dedupeBriefSourcesByUrl,
  checkCitationParity,
  type BriefJson,
} from "@/server/ai/composer/schema";

function brief(partial: Partial<BriefJson>): BriefJson {
  return {
    schema_version: 1,
    header: { date: "13 Jun 2026", cadence_label: "Daily", industry: "Test", personalization_summary: "For testing." },
    tldr: "",
    sections: [],
    why_it_matters: "Because it matters.",
    feedback_cta: "Reply to tune.",
    sources: [],
    ...partial,
  } as BriefJson;
}

describe("dedupeBriefSourcesByUrl", () => {
  it("merges two markers pointing at the same URL and renumbers", () => {
    const b = brief({
      tldr: "Alpha [1] and beta [3], plus gamma [2].",
      sections: [
        {
          heading: "S",
          bullets: [
            { text: "Beta detail [3].", citation_markers: [3] },
            { text: "Gamma detail [2].", citation_markers: [2] },
          ],
        },
      ],
      sources: [
        { marker: 1, title: "A", url: "https://x.com/a" },
        { marker: 2, title: "B", url: "https://y.com/b" },
        { marker: 3, title: "A dup", url: "https://www.x.com/a/" }, // same as 1
      ],
    });
    const out = dedupeBriefSourcesByUrl(b);
    expect(out).not.toBeNull();
    // 3 sources -> 2 (x.com/a deduped), renumbered 1..2.
    expect(out!.brief.sources.map((s) => s.url)).toEqual([
      "https://x.com/a",
      "https://y.com/b",
    ]);
    // marker 3 folded onto 1; marker 2 -> 2. Body markers rewritten.
    expect(out!.brief.tldr).toBe("Alpha [1] and beta [1], plus gamma [2].");
    expect(out!.brief.sections[0].bullets[0].citation_markers).toEqual([1]);
    expect(out!.brief.sections[0].bullets[1].citation_markers).toEqual([2]);
    // Result is parity-clean.
    expect(checkCitationParity(out!.brief).ok).toBe(true);
  });

  it("returns null when no URL repeats", () => {
    const b = brief({
      tldr: "Solo [1].",
      sections: [{ heading: "S", bullets: [{ text: "x [1]", citation_markers: [1] }] }],
      sources: [{ marker: 1, title: "A", url: "https://x.com/a" }],
    });
    expect(dedupeBriefSourcesByUrl(b)).toBeNull();
  });

  it("does not mutate the input", () => {
    const b = brief({
      tldr: "A [1] B [2].",
      sections: [{ heading: "S", bullets: [{ text: "x [1][2]", citation_markers: [1, 2] }] }],
      sources: [
        { marker: 1, title: "A", url: "https://x.com/a" },
        { marker: 2, title: "dup", url: "https://x.com/a" },
      ],
    });
    const before = JSON.stringify(b);
    dedupeBriefSourcesByUrl(b);
    expect(JSON.stringify(b)).toBe(before);
  });
});
