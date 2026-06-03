/**
 * NormalizedSourceItem — Phase 6a foundation (CAD-113).
 *
 * Locked contract for everything Cadence's "free data" patterns return:
 *   - Pattern A: Playwright scrapers
 *   - Pattern B: SERP scrapes  (Phase 6b)
 *   - Pattern C: RSS aggregator
 *   - Pattern D: Perplexity Sonar  (existing, will adopt this shape over time)
 *
 * Source-of-truth research doc:
 *   cadence/strategy/free-data-source-plan-v1.md §10 "ONE-WAY DOORS":
 *   > Building scraper framework before standardizing the normalizer
 *   > interface → lock the NormalizedSourceItem Zod schema in CAD-113 first.
 *
 * This file is the schema. Touch it only with a follow-up migration plan —
 * every downstream scraper and the composer pre-compose hook depend on it.
 */
import { z } from "zod";

/**
 * The four kinds of source an item can come from. Kept as a string union
 * (not enum) because Drizzle / Zod / TS treat string literals best, and we
 * may persist these values to JSON columns where enum coercion is fragile.
 */
export const sourceTypeSchema = z.enum([
  "scrape",
  "rss",
  "serp",
  "perplexity",
]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

/**
 * One normalized item from any free-data source.
 *
 * Field notes:
 *  - `source_id` is a stable handle for the source ("mpob-stocks",
 *    "bernama-agri-rss", "yahoo-finance-quote:1155.KL"). Used for
 *    telemetry, dedup buckets, and the future scraper health dashboard.
 *  - `url` is the canonical link a human would click. For RSS items it's
 *    the article URL, not the feed URL. For scrapes it's the page scraped.
 *  - `body_excerpt` is bounded so a runaway scrape can't blow up the
 *    composer's prompt budget. 2_000 chars matches `rssItems.summary`.
 *  - `published_at` is optional because not every source publishes one
 *    (e.g. a stock-quote scrape; the value IS the timestamp).
 *  - `raw_metadata` is the per-source bag of extra fields (price, ticker,
 *    feedUrl, selector-version, etc.). Treated as opaque by the composer
 *    so adding a key on one scraper doesn't ripple.
 */
export const normalizedSourceItemSchema = z.object({
  source_id: z.string().min(1).max(120),
  source_type: sourceTypeSchema,
  url: z.string().url().max(2_048),
  title: z.string().min(1).max(500),
  body_excerpt: z.string().max(2_000).default(""),
  published_at: z.date().nullable().optional(),
  raw_metadata: z.record(z.unknown()).default({}),
});

export type NormalizedSourceItem = z.infer<typeof normalizedSourceItemSchema>;

/**
 * Safe parser that NEVER throws. Returns null + logs on shape mismatch so
 * one bad row from a scraper can't kill an entire aggregate fetch.
 */
export function parseNormalizedItem(
  raw: unknown,
  context?: string
): NormalizedSourceItem | null {
  const r = normalizedSourceItemSchema.safeParse(raw);
  if (!r.success) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[sources/types] dropped malformed item${context ? ` (${context})` : ""}:`,
        r.error.issues.slice(0, 3)
      );
    }
    return null;
  }
  return r.data;
}
