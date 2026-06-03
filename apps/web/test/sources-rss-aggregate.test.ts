/**
 * RSS aggregator tests — Phase 6a Pattern C (CAD-113 #2).
 */
import { describe, it, expect } from "vitest";
import { aggregateRss } from "@/server/sources/rss/aggregate";
import { CURATED_FEEDS, feedsForTopics } from "@/server/sources/rss/feeds";

function makeMockParser(map: Record<string, unknown>) {
  return {
    async parseURL(url: string) {
      if (!(url in map)) throw new Error(`no mock for ${url}`);
      const v = map[url];
      if (v instanceof Error) throw v;
      return v as ReturnType<typeof JSON.parse>;
    },
  };
}

describe("aggregateRss (Pattern C)", () => {
  it("returns [] for empty input", async () => {
    const out = await aggregateRss([]);
    expect(out).toEqual([]);
  });

  it("normalizes items from a single feed", async () => {
    const url = CURATED_FEEDS[0].url; // bernama-agri
    const parserImpl = makeMockParser({
      [url]: {
        items: [
          {
            title: "Palm oil hits 3-month high",
            link: "https://www.bernama.com/en/business/news.php?id=1",
            guid: "id-1",
            isoDate: "2026-06-01T08:00:00.000Z",
            contentSnippet: "CPO futures rallied to RM 4,200/tonne...",
          },
        ],
      },
    });
    const out = await aggregateRss([url], { parserImpl });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source_id: "bernama-agri",
      source_type: "rss",
      title: "Palm oil hits 3-month high",
      url: "https://www.bernama.com/en/business/news.php?id=1",
    });
    expect(out[0].published_at?.toISOString()).toBe("2026-06-01T08:00:00.000Z");
    expect(out[0].raw_metadata).toMatchObject({ feed_url: url, guid: "id-1" });
  });

  it("returns partial results when one feed throws", async () => {
    const goodUrl = CURATED_FEEDS[0].url;
    const badUrl = CURATED_FEEDS[1].url;
    const parserImpl = makeMockParser({
      [goodUrl]: {
        items: [
          {
            title: "Good item",
            link: "https://example.com/a",
            guid: "g1",
            isoDate: new Date().toISOString(),
          },
        ],
      },
      [badUrl]: new Error("network reset"),
    });
    const out = await aggregateRss([goodUrl, badUrl], { parserImpl });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Good item");
  });

  it("sorts newest-first across feeds", async () => {
    const urlA = CURATED_FEEDS[0].url;
    const urlB = CURATED_FEEDS[1].url;
    const parserImpl = makeMockParser({
      [urlA]: {
        items: [
          {
            title: "Older",
            link: "https://example.com/old",
            guid: "old",
            isoDate: "2026-05-01T00:00:00Z",
          },
        ],
      },
      [urlB]: {
        items: [
          {
            title: "Newer",
            link: "https://example.com/new",
            guid: "new",
            isoDate: "2026-06-01T00:00:00Z",
          },
        ],
      },
    });
    const out = await aggregateRss([urlA, urlB], { parserImpl });
    expect(out.map((i) => i.title)).toEqual(["Newer", "Older"]);
  });

  it("drops items missing required fields without crashing", async () => {
    const url = CURATED_FEEDS[0].url;
    const parserImpl = makeMockParser({
      [url]: {
        items: [
          { title: "no url" }, // missing link/guid → dropped
          {
            title: "good",
            link: "https://example.com/g",
            guid: "g",
            isoDate: new Date().toISOString(),
          },
        ],
      },
    });
    const out = await aggregateRss([url], { parserImpl });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("good");
  });

  it("caps each feed at 20 items", async () => {
    const url = CURATED_FEEDS[0].url;
    const items = Array.from({ length: 30 }, (_, i) => ({
      title: `t${i}`,
      link: `https://example.com/${i}`,
      guid: `g${i}`,
      isoDate: new Date(2026, 0, i + 1).toISOString(),
    }));
    const parserImpl = makeMockParser({ [url]: { items } });
    const out = await aggregateRss([url], { parserImpl });
    expect(out).toHaveLength(20);
  });
});

describe("feedsForTopics + CURATED_FEEDS", () => {
  it("ships at least 15 curated feeds", () => {
    expect(CURATED_FEEDS.length).toBeGreaterThanOrEqual(15);
  });

  it("every curated feed has stable id, https url, ≥1 topic", () => {
    for (const f of CURATED_FEEDS) {
      expect(f.id).toMatch(/^[a-z0-9-]+(:[a-z0-9_.-]+)?$/);
      expect(f.url).toMatch(/^https?:\/\//);
      expect(f.topics.length).toBeGreaterThan(0);
    }
  });

  it("filters feeds by topic intersection", () => {
    const agri = feedsForTopics(["palm_oil"]);
    expect(agri.length).toBeGreaterThan(0);
    expect(agri.every((f) => f.topics.includes("palm_oil"))).toBe(true);
  });

  it("returns all feeds when no topics passed (defensive default)", () => {
    expect(feedsForTopics([]).length).toBe(CURATED_FEEDS.length);
  });

  it("topic match is case-insensitive", () => {
    const upper = feedsForTopics(["PALM_OIL"]);
    const lower = feedsForTopics(["palm_oil"]);
    expect(upper.length).toBe(lower.length);
  });
});
