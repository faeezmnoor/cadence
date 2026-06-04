/**
 * gatherSources — Phase 6a Pattern A + C wire-in (CAD-113 #4).
 *
 * Single composer-facing entry point that pulls free, grounded data from
 * the curated toolbox (RSS via Pattern C, Playwright scrapers via Pattern
 * A) and returns a flat NormalizedSourceItem[] for the composer to
 * inject into its prompt.
 *
 * Contract:
 *  - NEVER throws. Per-source failures are swallowed and logged so a
 *    broken feed / scrape can never break a brief.
 *  - Caps the result so a runaway aggregate can't blow the prompt
 *    budget (MAX_ITEMS = 10, BODY_EXCERPT_CHARS = 500).
 *  - Pure-ish: emits no DB writes. Caller owns telemetry persistence.
 *
 * Routing rules (kept deliberately simple — keyword → bucket → fanout):
 *  - Build a topic-bucket set from spec.topics + spec.topicHint via a
 *    coarse keyword dictionary (TOPIC_KEYWORDS).
 *  - Pattern C (RSS): fanout to every CuratedFeed whose `topics`
 *    intersects the bucket set. Capped at 5 feeds per call so we don't
 *    spawn 17 parallel HTTP requests on every brief.
 *  - Pattern A (scrape): topic-conditional. Palm-oil ICP triggers MPOB +
 *    Bursa CPO; equity ticker presence triggers up to 2 Yahoo quotes.
 *
 * This is the DEFAULT composer's free-data layer. Pro tier (Perplexity
 * Sonar) does its own sourcing — see providers/perplexity.ts.
 *
 * Source-of-truth research doc:
 *   cadence/strategy/free-data-source-plan-v1.md §2 + §6.
 */
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";
import type { NormalizedSourceItem } from "./types";
import { aggregateRss } from "./rss/aggregate";
import { CURATED_FEEDS, feedsForTopics, type CuratedFeed } from "./rss/feeds";

/* -------------------------------------------------------------------------- */
/* Tunables (exported for tests)                                              */
/* -------------------------------------------------------------------------- */

/** Hard cap on items returned to the composer. Keeps prompt budget bounded. */
export const MAX_GATHERED_ITEMS = 10;
/** Per-item excerpt cap. Matches the caller's prompt-budget expectations. */
export const BODY_EXCERPT_CHARS = 500;
/** Hard cap on RSS feeds we fan out to per brief. Prevents 17-feed bursts. */
export const MAX_RSS_FEEDS_PER_CALL = 5;
/** Hard cap on Yahoo Finance ticker scrapes per brief. */
export const MAX_YAHOO_SCRAPES_PER_CALL = 2;

/* -------------------------------------------------------------------------- */
/* Topic keyword router                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Map of bucket → trigger keywords. Lowercase, substring-matched against
 * spec.topics + spec.topicHint. Order doesn't matter; one match adds the
 * bucket to the active set.
 *
 * Buckets MUST line up with CuratedFeed.topics (see ./rss/feeds.ts) — we
 * pass these straight into feedsForTopics(). Adding a bucket here that no
 * feed advertises is a silent no-op for RSS routing.
 */
export const TOPIC_KEYWORDS: Record<string, readonly string[]> = {
  // Commodities anchor — ICP-1
  palm_oil: ["palm oil", "cpo", "fcpo", "mpob", "palm"],
  commodities: ["commodit", "soybean", "corn", "wheat", "coffee", "sugar", "cocoa", "rubber"],
  oil_gas: ["oil", "brent", "wti", "gas", "lng", "crude"],
  agri: ["agri", "farm", "feed", "livestock", "poultry", "chicken"],
  // Geography
  malaysia: ["malaysia", "malay", "kuala lumpur", "klse", "bursa", "myr", "ringgit"],
  sea: ["southeast asia", "asean", "sea ", "indonesia", "singapore", "thailand", "vietnam"],
  // Verticals
  tech: ["tech", "software", "ai", "saas", "developer", "infra"],
  saas: ["saas", "b2b software", "subscription"],
  startups: ["startup", "founder", "vc", "venture", "seed", "series"],
  funding: ["funding", "raise", "investment round", "term sheet"],
  equities: ["stock", "equity", "equities", "share", "ipo", "klse", "bursa", "nasdaq", "nyse"],
  business: ["business", "industry", "market"],
  regulatory: ["regulatory", "regulation", "compliance", "policy", "bnm", "sec", "central bank"],
  banking: ["bank", "banking", "loan", "credit", "deposit"],
  crypto: ["crypto", "bitcoin", "btc", "ethereum", "eth", "blockchain", "web3", "stablecoin"],
};

/**
 * Returns the unique set of topic buckets that match the spec's topics +
 * topicHint. Substring + case-insensitive. Empty input → empty set
 * (caller should treat that as "no Pattern A/C fanout"; the composer can
 * still run on whatever existing Brave + spec-bound RSS produces).
 */
export function bucketsForSpec(spec: {
  topics?: readonly string[];
  topicHint?: string | null;
}): string[] {
  const haystack: string[] = [];
  if (spec.topics) {
    for (const t of spec.topics) haystack.push(t.toLowerCase());
  }
  if (spec.topicHint) haystack.push(spec.topicHint.toLowerCase());
  if (haystack.length === 0) return [];
  const joined = haystack.join("  ");
  const matched = new Set<string>();
  for (const [bucket, kws] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (joined.includes(kw)) {
        matched.add(bucket);
        break;
      }
    }
  }
  return [...matched];
}

/* -------------------------------------------------------------------------- */
/* Public type                                                                */
/* -------------------------------------------------------------------------- */

/** Telemetry breakdown emitted on every successful gather. */
export interface GatheredSourcesTelemetry {
  count: number;
  types: { rss: number; scrape: number };
  bucketsMatched: string[];
  feedsFanout: number;
  scrapersFanout: number;
}

export interface GatherResult {
  items: NormalizedSourceItem[];
  telemetry: GatheredSourcesTelemetry;
}

/** Dependency-injection seam (tests pass mocks; prod uses module defaults). */
export interface GatherSourcesDeps {
  aggregateRss?: typeof aggregateRss;
  scrapeMpobStocks?: () => Promise<NormalizedSourceItem | null>;
  scrapeBursaCpo?: () => Promise<NormalizedSourceItem | null>;
  scrapeYahooQuote?: (ticker: string) => Promise<NormalizedSourceItem | null>;
  /** Override the curated feed list (mostly for tests). */
  curatedFeeds?: readonly CuratedFeed[];
}

/* -------------------------------------------------------------------------- */
/* gatherSources                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Pull free, grounded data items for the given spec.
 *
 * Resilient by design — every per-source call is wrapped in try/catch so
 * a partial result is always preferable to a thrown error. Returns
 * telemetry the caller can stamp on runMetadata.gatheredSources for
 * /admin/cost visibility.
 */
export async function gatherSources(
  spec: {
    topics?: readonly string[];
    topicHint?: string | null;
    entities?: Partial<DigestSpecV1["entities"]>;
  },
  deps: GatherSourcesDeps = {}
): Promise<GatherResult> {
  const buckets = bucketsForSpec(spec);
  const items: NormalizedSourceItem[] = [];
  let feedsFanout = 0;
  let scrapersFanout = 0;

  // -- Pattern C: RSS ------------------------------------------------------
  try {
    const feeds = buckets.length === 0
      ? []
      : feedsForTopics(buckets).slice(0, MAX_RSS_FEEDS_PER_CALL);
    feedsFanout = feeds.length;
    if (feeds.length > 0) {
      const agg = deps.aggregateRss ?? aggregateRss;
      const rssItems = await agg(feeds.map((f) => f.url));
      items.push(...rssItems);
    }
  } catch (err) {
    console.warn("[gatherSources/rss] swallowed:", errMsg(err));
  }

  // -- Pattern A: scrapers (topic-conditional) -----------------------------
  // Palm-oil ICP → MPOB + Bursa CPO.
  if (buckets.includes("palm_oil")) {
    if (deps.scrapeMpobStocks) {
      try {
        scrapersFanout++;
        const it = await deps.scrapeMpobStocks();
        if (it) items.push(it);
      } catch (err) {
        console.warn("[gatherSources/mpob] swallowed:", errMsg(err));
      }
    }
    if (deps.scrapeBursaCpo) {
      try {
        scrapersFanout++;
        const it = await deps.scrapeBursaCpo();
        if (it) items.push(it);
      } catch (err) {
        console.warn("[gatherSources/bursa] swallowed:", errMsg(err));
      }
    }
  }

  // Equity tickers → up to N Yahoo Finance quote scrapes.
  if (deps.scrapeYahooQuote) {
    const tickers = (spec.entities?.tickers ?? []).slice(0, MAX_YAHOO_SCRAPES_PER_CALL);
    for (const ticker of tickers) {
      try {
        scrapersFanout++;
        const it = await deps.scrapeYahooQuote(ticker);
        if (it) items.push(it);
      } catch (err) {
        console.warn(`[gatherSources/yahoo:${ticker}] swallowed:`, errMsg(err));
      }
    }
  }

  // Cap + truncate excerpts so the composer prompt budget is bounded.
  const capped = items.slice(0, MAX_GATHERED_ITEMS).map((it) => ({
    ...it,
    body_excerpt: (it.body_excerpt ?? "").slice(0, BODY_EXCERPT_CHARS),
  }));

  const rssCount = capped.filter((i) => i.source_type === "rss").length;
  const scrapeCount = capped.filter((i) => i.source_type === "scrape").length;

  return {
    items: capped,
    telemetry: {
      count: capped.length,
      types: { rss: rssCount, scrape: scrapeCount },
      bucketsMatched: buckets,
      feedsFanout,
      scrapersFanout,
    },
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Touched-by-tests re-exports.
export { CURATED_FEEDS };
