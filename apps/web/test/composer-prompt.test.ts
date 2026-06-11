import { describe, it, expect } from "vitest";
import {
  buildComposerSystemPrompt,
  COMPOSER_HARD_CHAR_CAP,
} from "@/server/ai/composer/prompt";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";

describe("composer prompt v2", () => {
  const spec = emptyDigestSpec();

  it("declares the JSON output contract with schema_version 1", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/OUTPUT CONTRACT/);
    expect(p).toMatch(/"schema_version": 1/);
    expect(p).toMatch(/why_it_matters/);
    expect(p).toMatch(/feedback_cta/);
  });

  it("opens with the trader-desk voice line, not generic Bloomberg-corporate", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/sharp trader-desk friend/);
    // The old v1 opener must be gone — too corporate per design audit.
    expect(p).not.toMatch(/daily market intelligence brief generator/);
  });

  it("never identifies the output as a Telegram message", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    // System prompt must NOT instruct the model to write "Telegram-safe Markdown"
    // or to call the brief a Telegram brief — channel framing lives downstream.
    expect(p).not.toMatch(/Telegram-safe Markdown/);
    expect(p).not.toMatch(/Telegram brief/i);
  });

  it("contains 2 few-shot examples from different industries", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/Example A/);
    expect(p).toMatch(/Example B/);
    // Maximally-different anchor industries:
    expect(p).toMatch(/palm oil/i);
    expect(p).toMatch(/halal/i);
  });

  it("respects keywords_exclude instruction", () => {
    const p = buildComposerSystemPrompt({
      spec: { ...spec, keywords_exclude: ["crypto"] },
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/keywords_exclude/);
  });

  it("injects distilled prefs and recent raw notes", () => {
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
      distilledPrefs: ["prefers tables", "no crypto"],
      recentRawNotes: ["2026-06-01: skip Indonesia politics"],
    });
    expect(p).toMatch(/prefers tables/);
    expect(p).toMatch(/no crypto/);
    expect(p).toMatch(/skip Indonesia politics/);
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

  describe("research memo block (CAD-222 A2)", () => {
    const memoInput = {
      spec,
      sources: { search: [], rss: [] },
      researchMemo: "CPO eased 0.4% per MPOB data; quota lifted 12%.",
    };

    it("renders a clearly-bounded memo block AFTER the sources block", () => {
      const p = buildComposerSystemPrompt(memoInput);
      expect(p).toContain(
        "RESEARCH MEMO (secondary — verify every claim against the SOURCES above; cite only numbered sources)"
      );
      expect(p).toContain("<research_memo>");
      expect(p).toContain("CPO eased 0.4% per MPOB data; quota lifted 12%.");
      expect(p).toContain("</research_memo>");
      const sourcesIdx = p.indexOf("SOURCES (already fetched and deduped");
      const memoIdx = p.indexOf("RESEARCH MEMO");
      expect(sourcesIdx).toBeGreaterThan(-1);
      expect(memoIdx).toBeGreaterThan(sourcesIdx);
    });

    it("marks the memo as non-citable", () => {
      const p = buildComposerSystemPrompt(memoInput);
      expect(p).toMatch(/NOT a\ncitable source/);
    });

    it("is omitted entirely when absent or blank", () => {
      const without = buildComposerSystemPrompt({
        spec,
        sources: { search: [], rss: [] },
      });
      expect(without).not.toContain("RESEARCH MEMO");
      expect(without).not.toContain("<research_memo>");
      const blank = buildComposerSystemPrompt({
        spec,
        sources: { search: [], rss: [] },
        researchMemo: "   ",
      });
      expect(blank).not.toContain("RESEARCH MEMO");
    });

    it("flows through to the Pro Sonnet prompt (A2 uses the Pro composer)", async () => {
      const { buildProComposerSystemPrompt } = await import(
        "@/server/ai/providers/anthropic-pro-prompt"
      );
      const p = buildProComposerSystemPrompt(memoInput);
      expect(p).toContain("RESEARCH MEMO");
      expect(p).toContain("CPO eased 0.4% per MPOB data; quota lifted 12%.");
    });
  });
});
