/**
 * Tests for NormalizedSourceItem schema (CAD-113 Phase 6a Ticket 1).
 * Locks the shape so downstream scrapers can't drift.
 */
import { describe, it, expect } from "vitest";
import {
  normalizedSourceItemSchema,
  parseNormalizedItem,
  sourceTypeSchema,
  type NormalizedSourceItem,
} from "@/server/sources/types";

describe("NormalizedSourceItem schema", () => {
  it("accepts a minimal valid RSS item", () => {
    const item = {
      source_id: "bernama-agri-rss",
      source_type: "rss",
      url: "https://www.bernama.com/en/business/news.php?id=12345",
      title: "MPOB releases monthly palm oil stocks",
    };
    const r = normalizedSourceItemSchema.safeParse(item);
    expect(r.success).toBe(true);
    if (r.success) {
      // Defaults applied.
      expect(r.data.body_excerpt).toBe("");
      expect(r.data.raw_metadata).toEqual({});
    }
  });

  it("accepts a full scrape item with metadata", () => {
    const item: NormalizedSourceItem = {
      source_id: "mpob-stocks",
      source_type: "scrape",
      url: "https://bepi.mpob.gov.my/index.php/en/statistics/stock",
      title: "Palm Oil Stocks — April 2026",
      body_excerpt: "Closing stocks: 1.85m tonnes, -3% MoM.",
      published_at: new Date("2026-05-10T00:00:00Z"),
      raw_metadata: { closing_stocks_mt: 1_850_000, mom_pct: -3 },
    };
    expect(normalizedSourceItemSchema.parse(item)).toMatchObject(item);
  });

  it("rejects invalid source_type", () => {
    const r = normalizedSourceItemSchema.safeParse({
      source_id: "x",
      source_type: "twitter",
      url: "https://example.com",
      title: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-URL url", () => {
    const r = normalizedSourceItemSchema.safeParse({
      source_id: "x",
      source_type: "rss",
      url: "not-a-url",
      title: "x",
    });
    expect(r.success).toBe(false);
  });

  it("locks the four allowed source types", () => {
    expect(sourceTypeSchema.options).toEqual([
      "scrape",
      "rss",
      "serp",
      "perplexity",
    ]);
  });

  it("parseNormalizedItem returns null on bad shape, no throw", () => {
    expect(parseNormalizedItem({ totally: "wrong" })).toBeNull();
    expect(parseNormalizedItem(null)).toBeNull();
    expect(parseNormalizedItem(undefined)).toBeNull();
  });

  it("parseNormalizedItem returns the item on good shape", () => {
    const item = parseNormalizedItem({
      source_id: "x",
      source_type: "scrape",
      url: "https://example.com/a",
      title: "Title",
    });
    expect(item).not.toBeNull();
    expect(item?.source_type).toBe("scrape");
  });

  it("truncates rejected — caller must pre-trim body_excerpt > 2000", () => {
    const r = normalizedSourceItemSchema.safeParse({
      source_id: "x",
      source_type: "rss",
      url: "https://example.com/a",
      title: "Title",
      body_excerpt: "x".repeat(2_001),
    });
    expect(r.success).toBe(false);
  });
});
