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
  normalizeSourceUrl,
  dedupeByUrl,
  MAX_GATHERED_ITEMS,
  BODY_EXCERPT_CHARS,
  MAX_RSS_FEEDS_PER_CALL,
  MAX_GNEWS_FEEDS_PER_CALL,
} from "@/server/sources";
import type { NormalizedSourceItem } from "@/server/sources/types";

/**
 * Fresh fixture dates: gatherSources applies a 48h freshness cut
 * (CAD-221), so fixtures publish "i minutes ago" relative to the test
 * run. Higher i = older, all comfortably inside the window.
 */
function rssItem(i: number, source_id = "bernama-agri"): NormalizedSourceItem {
  return {
    source_id,
    source_type: "rss",
    url: `https://example.com/article-${i}`,
    title: `Headline ${i}`,
    body_excerpt: `Body for ${i} — `.repeat(80), // > 500 chars to force trim
    published_at: new Date(Date.now() - (i + 1) * 60_000),
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
      gnewsFeeds: expect.any(Number),
      gnewsItems: expect.any(Number),
      dedupedCount: expect.any(Number),
      freshnessDropped: expect.any(Number),
    });
  });
});

/* ------------------------------------------------------------------------ */
/* CAD-221 recall pack — gnews wiring, interleave, dedup, freshness         */
/* ------------------------------------------------------------------------ */

describe("gatherSources — gnews entity feeds (CAD-221)", () => {
  it("fans out gnews feeds from companies + keywords even when no bucket matches", async () => {
    const calls: Array<readonly string[]> = [];
    const aggregateRss = vi.fn(async (urls: readonly string[]) => {
      calls.push(urls);
      return [rssItem(1, "gnews-sime-darby")];
    });
    const out = await gatherSources(
      {
        topics: ["totally unrelated lorem ipsum"],
        topicHint: null,
        entities: { companies: ["Sime Darby"], tickers: [], commodities: [] },
        keywords: ["FGV Holdings"],
      },
      { aggregateRss }
    );
    // No bucket matched → no curated call, but gnews still fans out.
    expect(calls).toHaveLength(1);
    expect(calls[0].every((u) => u.startsWith("https://news.google.com/rss/search?q="))).toBe(true);
    expect(calls[0]).toHaveLength(2); // Sime Darby + FGV Holdings
    expect(out.telemetry.gnewsFeeds).toBe(2);
    expect(out.telemetry.gnewsItems).toBe(1);
    expect(out.telemetry.feedsFanout).toBe(0);
  });

  it("caps gnews fanout at MAX_GNEWS_FEEDS_PER_CALL without starving curated", async () => {
    const calls: Array<readonly string[]> = [];
    const aggregateRss = vi.fn(async (urls: readonly string[]) => {
      calls.push(urls);
      return [];
    });
    const out = await gatherSources(
      {
        topics: ["palm oil malaysia"],
        topicHint: null,
        entities: {
          companies: ["Sime Darby", "FGV Holdings", "IOI Corp", "KLK Berhad", "United Plantations"],
          tickers: [],
          commodities: [],
        },
        keywords: ["palm kernel"],
      },
      { aggregateRss }
    );
    expect(calls).toHaveLength(2); // curated + gnews pools
    const gnewsCall = calls.find((urls) =>
      urls.every((u) => u.startsWith("https://news.google.com/rss/search?q="))
    );
    expect(gnewsCall).toBeDefined();
    expect(gnewsCall!.length).toBe(MAX_GNEWS_FEEDS_PER_CALL);
    const curatedCall = calls.find((urls) => urls !== gnewsCall);
    expect(curatedCall!.length).toBeGreaterThan(0);
    expect(curatedCall!.length).toBeLessThanOrEqual(MAX_RSS_FEEDS_PER_CALL);
    expect(out.telemetry.gnewsFeeds).toBe(MAX_GNEWS_FEEDS_PER_CALL);
  });

  it("a gnews pool failure does not break the curated pool", async () => {
    const aggregateRss = vi.fn(async (urls: readonly string[]) => {
      if (urls[0]?.startsWith("https://news.google.com/")) throw new Error("gnews down");
      return [rssItem(1)];
    });
    const out = await gatherSources(
      {
        topics: ["palm oil"],
        topicHint: null,
        entities: { companies: ["Sime Darby"], tickers: [], commodities: [] },
      },
      { aggregateRss }
    );
    expect(out.items.map((i) => i.source_id)).toEqual(["bernama-agri"]);
    expect(out.telemetry.gnewsItems).toBe(0);
  });
});

describe("gatherSources — interleave + dedup + freshness (CAD-221)", () => {
  it("scrape items survive a busy RSS day (placed first, never head-sliced out)", async () => {
    const aggregateRss = vi.fn(async () =>
      Array.from({ length: 30 }, (_, i) => rssItem(i))
    );
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      {
        aggregateRss,
        scrapeMpobStocks: async () => scrapeItem("mpob-stocks"),
        scrapeBursaCpo: async () => scrapeItem("bursa-cpo"),
      }
    );
    expect(out.items.length).toBe(MAX_GATHERED_ITEMS);
    // Scrapes lead the assembly...
    expect(out.items[0].source_id).toBe("mpob-stocks");
    expect(out.items[1].source_id).toBe("bursa-cpo");
    // ...then RSS newest-first (fixture i=0 is the newest).
    expect(out.items[2].source_id).toBe("bernama-agri");
    expect(out.items[2].title).toBe("Headline 0");
    expect(out.telemetry.types.scrape).toBe(2);
  });

  it("interleaves gnews and curated RSS newest-first", async () => {
    const gnewsUrlPrefix = "https://news.google.com/rss/search?q=";
    const aggregateRss = vi.fn(async (urls: readonly string[]) => {
      if (urls[0]?.startsWith(gnewsUrlPrefix)) {
        return [
          { ...rssItem(0, "gnews-sime-darby"), url: "https://example.com/gnews-a" }, // newest
          { ...rssItem(4, "gnews-sime-darby"), url: "https://example.com/gnews-b" },
        ];
      }
      return [
        { ...rssItem(2, "bernama-agri"), url: "https://example.com/curated-a" },
        { ...rssItem(6, "bernama-agri"), url: "https://example.com/curated-b" },
      ];
    });
    const out = await gatherSources(
      {
        topics: ["palm oil"],
        topicHint: null,
        entities: { companies: ["Sime Darby"], tickers: [], commodities: [] },
      },
      { aggregateRss }
    );
    expect(out.items.map((i) => i.source_id)).toEqual([
      "gnews-sime-darby", // t-1min
      "bernama-agri", // t-3min
      "gnews-sime-darby", // t-5min
      "bernama-agri", // t-7min
    ]);
  });

  it("drops dated RSS older than 48h, keeps undated items last", async () => {
    const aggregateRss = vi.fn(async () => [
      { ...rssItem(0), url: "https://example.com/fresh" },
      {
        ...rssItem(1),
        url: "https://example.com/stale",
        published_at: new Date(Date.now() - 72 * 3_600_000),
      },
      {
        ...rssItem(2),
        url: "https://example.com/undated-pdf",
        published_at: null,
      },
    ]);
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      { aggregateRss }
    );
    expect(out.items.map((i) => i.url)).toEqual([
      "https://example.com/fresh",
      "https://example.com/undated-pdf", // kept, sorted after dated
    ]);
    expect(out.telemetry.freshnessDropped).toBe(1);
  });

  it("dedups by normalized URL across pools, scrape occurrence wins", async () => {
    const aggregateRss = vi.fn(async () => [
      {
        ...rssItem(0),
        url: "https://Example.com/mpob-stocks/?utm_source=rss", // dup of the scrape below
      },
      { ...rssItem(1), url: "https://example.com/unique" },
    ]);
    const out = await gatherSources(
      { topics: ["palm oil"], topicHint: null, entities: undefined as never },
      {
        aggregateRss,
        scrapeMpobStocks: async () => ({
          ...scrapeItem("mpob-stocks"),
          url: "https://example.com/mpob-stocks",
        }),
      }
    );
    expect(out.items.map((i) => i.source_id)).toEqual(["mpob-stocks", "bernama-agri"]);
    expect(out.items.map((i) => i.url)).toEqual([
      "https://example.com/mpob-stocks",
      "https://example.com/unique",
    ]);
    expect(out.telemetry.dedupedCount).toBe(1);
  });
});

describe("normalizeSourceUrl + dedupeByUrl (CAD-221)", () => {
  it("strips utm_* params, keeps other params in order", () => {
    expect(
      normalizeSourceUrl("https://example.com/a?utm_source=x&id=7&utm_medium=rss&page=2")
    ).toBe("https://example.com/a?id=7&page=2");
  });

  it("strips trailing slashes", () => {
    expect(normalizeSourceUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(normalizeSourceUrl("https://example.com/path//")).toBe("https://example.com/path");
  });

  it("lowercases host but preserves path case", () => {
    expect(normalizeSourceUrl("https://EXAMPLE.com/CaseSensitive")).toBe(
      "https://example.com/CaseSensitive"
    );
  });

  it("treats root with and without slash as the same URL", () => {
    expect(normalizeSourceUrl("https://example.com")).toBe(
      normalizeSourceUrl("https://example.com/")
    );
  });

  it("returns unparseable input trimmed as-is", () => {
    expect(normalizeSourceUrl("  not a url  ")).toBe("not a url");
  });

  it("dedupeByUrl keeps the first occurrence and counts removals", () => {
    const a = { ...rssItem(0), url: "https://example.com/x?utm_campaign=z" };
    const b = { ...rssItem(1), url: "https://EXAMPLE.com/x/" };
    const c = { ...rssItem(2), url: "https://example.com/y" };
    const out = dedupeByUrl([a, b, c]);
    expect(out.items).toEqual([a, c]);
    expect(out.removed).toBe(1);
  });
});
