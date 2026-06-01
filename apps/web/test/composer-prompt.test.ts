import { describe, it, expect } from "vitest";
import { buildComposerSystemPrompt, COMPOSER_HARD_CHAR_CAP } from "@/server/ai/composer/prompt";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";

describe("composer prompt", () => {
  const spec = emptyDigestSpec();

  it("contains the headline instruction", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/Lead with a 1-sentence headline/);
  });

  it("respects keywords_exclude instruction", () => {
    const p = buildComposerSystemPrompt({
      spec: { ...spec, keywords_exclude: ["crypto"] },
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/keywords_exclude/);
  });

  it("injects distilled prefs", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
      distilledPrefs: ["prefers tables", "no crypto"],
    });
    expect(p).toMatch(/prefers tables/);
    expect(p).toMatch(/no crypto/);
  });

  it("summarizes search + rss + prices", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: {
        search: [
          {
            query: "palm oil",
            results: [
              { title: "MPOB update", url: "https://example.com/a", description: "x" },
            ],
          },
        ],
        rss: [
          {
            feedUrl: "https://example.com/feed.xml",
            title: "Headline",
            url: "https://example.com/post",
            publishedAt: new Date("2026-06-01T00:00:00Z"),
            summary: "snippet",
          },
        ],
        prices: [{ symbol: "CPO=F", price: 4200, change24h: 1.2 }],
      },
    });
    expect(p).toMatch(/MPOB update/);
    expect(p).toMatch(/Headline/);
    expect(p).toMatch(/CPO=F: 4200/);
  });

  it("declares the hard char cap", () => {
    expect(COMPOSER_HARD_CHAR_CAP).toBe(3800);
  });
});
