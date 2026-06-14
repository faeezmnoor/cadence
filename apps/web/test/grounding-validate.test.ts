/**
 * CAD-226 grounding fix 2 — dead-link validator. Resolves cited URLs and
 * returns a corrective addendum naming dead markers; null when all live.
 */
import { describe, it, expect, vi } from "vitest";
import { makeDeadLinkValidator } from "@/server/ai/composer/grounding-validate";
import type { BriefJson } from "@/server/ai/composer/schema";

function briefWith(urls: string[]): BriefJson {
  return {
    schema_version: 1,
    header: { date: "13 Jun 2026", cadence_label: "Daily", industry: "Test", personalization_summary: "For testing." },
    tldr: "",
    sections: [{ heading: "S", bullets: [{ text: "x", citation_markers: [] }] }],
    why_it_matters: "y",
    feedback_cta: "z",
    sources: urls.map((url, i) => ({ marker: i + 1, title: `S${i}`, url })),
  } as BriefJson;
}

const resolveStub = (live: Set<string>) =>
  vi.fn(async (urls: readonly string[]) =>
    urls.map((url) => ({ url, status: live.has(url) ? 200 : 500, resolved: live.has(url), latencyMs: 1 }))
  );

describe("makeDeadLinkValidator", () => {
  it("returns null when every cited URL resolves", async () => {
    const b = briefWith(["https://a.com", "https://b.com"]);
    const validate = makeDeadLinkValidator({
      resolveImpl: resolveStub(new Set(["https://a.com", "https://b.com"])) as never,
    });
    expect(await validate(b)).toBeNull();
  });

  it("names the dead markers in the corrective addendum", async () => {
    const b = briefWith(["https://a.com", "https://dead.com"]);
    const validate = makeDeadLinkValidator({
      resolveImpl: resolveStub(new Set(["https://a.com"])) as never,
    });
    const out = await validate(b);
    expect(out).toContain("DEAD CITATIONS");
    expect(out).toContain("[2] https://dead.com");
    expect(out).not.toContain("[1] https://a.com");
  });

  it("never throws when resolution itself fails", async () => {
    const b = briefWith(["https://a.com"]);
    const validate = makeDeadLinkValidator({
      resolveImpl: vi.fn(async () => { throw new Error("network"); }) as never,
    });
    expect(await validate(b)).toBeNull();
  });

  it("returns null for a sourceless brief", async () => {
    const validate = makeDeadLinkValidator({ resolveImpl: vi.fn() as never });
    expect(await validate(briefWith([]))).toBeNull();
  });
});
