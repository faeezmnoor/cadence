/**
 * gatherSources tests — Phase 6a Pattern A + C wire-in (CAD-113 #4).
 *
 * Mocks every external dependency (RSS aggregator, scrapers) so the
 * suite never touches the network. Verifies:
 *   - keyword routing (bucketsForSpec)
 *   - palm_oil bucket triggers MPOB + Bursa scrapers
 *   - equity tickers trigger Yahoo scrapes (capped)
 *   - per-source failures are swallowed (resilience contract)
 *   - results cap at MAX_GATHERED_ITEMS with BODY_EXCERPT_CHARS-trimmed excerpts
 *   - telemetry shape matches what /admin/cost will consume
 */
import { describe, it, expect, vi } from "vitest";
import {
  gatherSources,
  bucketsForSpec,
  MAX_GATHERED_ITEMS,
  BODY_EXCERPT_CHARS,
  MAX_RSS_FEEDS_PER_CALL,
} from "@/server/sources";
import type { NormalizedSourceItem } from "@/server/sources/types";

function rssItem(i: number, source_id = "bernama-agri"): NormalizedSourceItem {
  return {
    source_id,
    source_type: "rss",
    url: `https://example.com/article-${i}`,
    title: `Headline ${i}`,
    body_excerpt: `Body for ${i} — `.repeat(80), // > 500 chars to force trim
    published_at: new Date("2026-06-01T08:00:00Z"),
    raw_metadata: {},
  };
}

function scrapeItem(source_id: string): NormalizedSourceItem {
  return {
    source_id,
    source_type: "scrape",
    url: `https://example.com/${source_id}`,
    title: `${source_id} snapshot`,
    body_excerpt: `Snapshot body for ${source_id}`,
    published_at: null,
    raw_metadata: {},
  };
}

describe("bucketsForSpec", () => {
  it("returns [] for empty input", () => {
    expect(bucketsForSpec({ topics: [], topicHint: null })).toEqual([]);
  });

  it("matches palm_oil keywords", () => {
    const out = bucketsForSpec({ topics: ["Palm oil prices in Malaysia"] });
    expect(out).toContain("palm_oil");
    expect(out).toContain("malaysia");
  });

  it("matches via topicHint", () => {
    const out = bucketsForSpec({ topics: ["industry digest"], topicHint: "crypto market" });
    expect(out).toContain("crypto");
  });

  it("case-insensitive", () => {
    expect(bucketsForSpec({ topics: ["BURSA Malaysia equities"] })).toContain("equities");
  });
});

describe("gatherSources", () => {
  it("returns empty result + zeroed telemetry when no buckets match", async () => {
    const aggregateRss = vi.fn(async () => []);
    const out = await gatherSources(
      { topics: ["totally unrelated lorem ipsum"], topicHint: null, entities: undefined as never },
      { aggregateRss }
    );
    expect(out.items).toEqual([]);
    expect(out.telemetry.count).toBe(0);
    expect(out.telemetry.feedsFanout).toBe(0);
    expect(aggregateRss).not.toHaveBeenCalled();
  });

  it("fanouts RSS for matched buckets and caps feed count", async () => {
    const aggregateRss = vi.fn(async (urls: readonly string[]) => {
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.length).toBeLessThanOrEqual(MAX_RSS_FEEDS_PER_CALL);
      return [rssItem(1), rssItem(2)];
    });
    const out = await gatherSources(
      { topics: ["palm oil + malaysia regulatory + business"], topicHint: null, entities: undefined as never },
      { aggregateRss }
    );
    expect(aggregateRss).toHaveBeenCalledTimes(1);
    expect(out.telemetry.types.rss).toBe(2);
    expect(out.telemetry.feedsFanout).toBeGreaterThan(0);
    expect(out.telemetry.bucketsMatched).toContain("palm_oil");
  });

  it("invokes palm_oil scrapers and adds them to results", async () => {
    const scrapeMpobStocks = vi.fn(async () => scrapeItem("mpob-stocks"));
    const scrapeBursaCpo = vi.fn(async () => scrapeItem("bursa-cpo"));
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      { aggregateRss: async () => [], scrapeMpobStocks, scrapeBursaCpo }
    );
    expect(scrapeMpobStocks).toHaveBeenCalledOnce();
    expect(scrapeBursaCpo).toHaveBeenCalledOnce();
    expect(out.items.map((i) => i.source_id)).toEqual(
      expect.arrayContaining(["mpob-stocks", "bursa-cpo"])
    );
    expect(out.telemetry.types.scrape).toBe(2);
    expect(out.telemetry.scrapersFanout).toBe(2);
  });

  it("calls Yahoo quote scraper per ticker (capped)", async () => {
    const scrapeYahooQuote = vi.fn(async (t: string) => scrapeItem(`yahoo-${t}`));
    const out = await gatherSources(
      {
        topics: ["equities"],
        topicHint: null,
        entities: { tickers: ["1155.KL", "AAPL", "MSFT", "GOOG"], companies: [], commodities: [] },
      },
      { aggregateRss: async () => [], scrapeYahooQuote }
    );
    expect(scrapeYahooQuote).toHaveBeenCalledTimes(2); // MAX_YAHOO_SCRAPES_PER_CALL
    expect(out.telemetry.scrapersFanout).toBe(2);
  });

  it("swallows scraper exceptions (resilience contract)", async () => {
    const scrapeMpobStocks = vi.fn(async () => {
      throw new Error("playwright timeout");
    });
    const scrapeBursaCpo = vi.fn(async () => scrapeItem("bursa-cpo"));
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      { aggregateRss: async () => [], scrapeMpobStocks, scrapeBursaCpo }
    );
    // mpob errored but bursa still landed.
    expect(out.items.map((i) => i.source_id)).toEqual(["bursa-cpo"]);
  });

  it("swallows RSS aggregator exceptions", async () => {
    const aggregateRss = vi.fn(async () => {
      throw new Error("network down");
    });
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      { aggregateRss }
    );
    expect(out.items).toEqual([]);
    expect(out.telemetry.count).toBe(0);
  });

  it("caps results at MAX_GATHERED_ITEMS and trims excerpts", async () => {
    const aggregateRss = vi.fn(async () =>
      Array.from({ length: 50 }, (_, i) => rssItem(i))
    );
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      { aggregateRss }
    );
    expect(out.items.length).toBe(MAX_GATHERED_ITEMS);
    for (const it of out.items) {
      expect(it.body_excerpt.length).toBeLessThanOrEqual(BODY_EXCERPT_CHARS);
    }
  });

  it("never throws even on every-source failure", async () => {
    const aggregateRss = vi.fn(async () => {
      throw new Error("rss boom");
    });
    const scrapeMpobStocks = vi.fn(async () => {
      throw new Error("mpob boom");
    });
    const scrapeBursaCpo = vi.fn(async () => {
      throw new Error("bursa boom");
    });
    const scrapeYahooQuote = vi.fn(async () => {
      throw new Error("yahoo boom");
    });
    await expect(
      gatherSources(
        {
          topics: ["palm oil equities"],
          topicHint: null,
          entities: { tickers: ["AAPL"], companies: [], commodities: [] },
        },
        { aggregateRss, scrapeMpobStocks, scrapeBursaCpo, scrapeYahooQuote }
      )
    ).resolves.toBeDefined();
  });

  it("emits a stable telemetry shape", async () => {
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      {
        aggregateRss: async () => [rssItem(1)],
        scrapeMpobStocks: async () => scrapeItem("mpob-stocks"),
        scrapeBursaCpo: async () => scrapeItem("bursa-cpo"),
      }
    );
    expect(out.telemetry).toMatchObject({
      count: expect.any(Number),
      types: { rss: expect.any(Number), scrape: expect.any(Number) },
      bucketsMatched: expect.any(Array),
      feedsFanout: expect.any(Number),
      scrapersFanout: expect.any(Number),
    });
  });
});
