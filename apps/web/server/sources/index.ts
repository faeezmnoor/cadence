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
import { aggregateRss, applyFreshnessCut } from "./rss/aggregate";
import { CURATED_FEEDS, feedsForTopics, type CuratedFeed } from "./rss/feeds";
import { buildGnewsFeeds } from "./rss/gnews";

/* -------------------------------------------------------------------------- */
/* Tunables (exported for tests)                                              */
/* -------------------------------------------------------------------------- */

/** Hard cap on items returned to the composer. Keeps prompt budget bounded. */
export const MAX_GATHERED_ITEMS = 10;
/** Per-item excerpt cap. Matches the caller's prompt-budget expectations. */
export const BODY_EXCERPT_CHARS = 500;
/** Hard cap on RSS feeds we fan out to per brief. Prevents 17-feed bursts. */
export const MAX_RSS_FEEDS_PER_CALL = 5;
/**
 * CAD-221: separate budget for dynamic Google News entity/keyword feeds so
 * neither pool starves the other — curated keeps its 5, gnews gets its own 4.
 */
export const MAX_GNEWS_FEEDS_PER_CALL = 4;
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
  malaysia: [
    "malaysia",
    "malay",
    "kuala lumpur",
    "klse",
    "bursa",
    "myr",
    "ringgit",
    // Wave 4 Bug 9: gov-procurement names route to malaysia + regulatory.
    "eperolehan",
    "myprocurement",
    "jakim",
    "lhdn",
    "bnm",
    "sc malaysia",
  ],
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
  entities?: {
    companies?: readonly string[];
    tickers?: readonly string[];
    commodities?: readonly string[];
  };
}): string[] {
  const haystack: string[] = [];
  if (spec.topics) {
    for (const t of spec.topics) haystack.push(t.toLowerCase());
  }
  if (spec.topicHint) haystack.push(spec.topicHint.toLowerCase());
  // Wave 4 Bug 9: entities are the user's HARD anchors — fold them into
  // the bucket detection haystack so a Malaysia-specific entity like
  // ePerolehan routes the brief to malaysia + regulatory feeds instead
  // of generic equities/business.
  if (spec.entities?.companies) {
    for (const c of spec.entities.companies) haystack.push(c.toLowerCase());
  }
  if (spec.entities?.tickers) {
    for (const t of spec.entities.tickers) haystack.push(t.toLowerCase());
  }
  if (spec.entities?.commodities) {
    for (const c of spec.entities.commodities) haystack.push(c.toLowerCase());
  }
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
  /** CAD-221: dynamic Google News entity/keyword feeds fanned out. */
  gnewsFeeds: number;
  /** CAD-221: gnews-originated items that survived into the final result. */
  gnewsItems: number;
  /** CAD-221: items removed by URL-level dedup (pre-cap). */
  dedupedCount: number;
  /** CAD-221: dated RSS items dropped by the 48h freshness cut. */
  freshnessDropped: number;
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
    /** CAD-221: spec.keywords_include — drives dynamic Google News feeds. */
    keywords?: readonly string[];
  },
  deps: GatherSourcesDeps = {}
): Promise<GatherResult> {
  const buckets = bucketsForSpec(spec);
  const agg = deps.aggregateRss ?? aggregateRss;
  let scrapersFanout = 0;

  // -- Pattern C: curated RSS + CAD-221 dynamic Google News entity feeds ---
  const wanted = new Set(buckets.map((b) => b.toLowerCase()));
  const curatedFeeds =
    buckets.length === 0
      ? []
      : (deps.curatedFeeds
          ? deps.curatedFeeds.filter((f) =>
              f.topics.some((t) => wanted.has(t.toLowerCase()))
            )
          : [...feedsForTopics(buckets)]
        ).slice(0, MAX_RSS_FEEDS_PER_CALL);
  // Gnews feeds are bucket-independent on purpose: the competitor-watch
  // ICP names companies/keywords that may match no topic bucket at all —
  // that recall gap is exactly what CAD-221 closes.
  const gnewsFeeds = buildGnewsFeeds({
    companies: spec.entities?.companies ?? [],
    keywords: spec.keywords ?? [],
  }).slice(0, MAX_GNEWS_FEEDS_PER_CALL);
  const feedsFanout = curatedFeeds.length;

  const fetchPool = async (
    feeds: readonly CuratedFeed[],
    tag: string
  ): Promise<NormalizedSourceItem[]> => {
    if (feeds.length === 0) return [];
    try {
      return await agg(
        feeds.map((f) => f.url),
        { sourceIdByUrl: Object.fromEntries(feeds.map((f) => [f.url, f.id])) }
      );
    } catch (err) {
      console.warn(`[gatherSources/${tag}] swallowed:`, errMsg(err));
      return [];
    }
  };

  const [curatedItems, gnewsRaw] = await Promise.all([
    fetchPool(curatedFeeds, "rss"),
    fetchPool(gnewsFeeds, "gnews"),
  ]);

  // -- Pattern A: scrapers (topic-conditional) -----------------------------
  // Palm-oil ICP → MPOB + Bursa CPO.
  const scrapeItems: NormalizedSourceItem[] = [];
  if (buckets.includes("palm_oil")) {
    if (deps.scrapeMpobStocks) {
      try {
        scrapersFanout++;
        const it = await deps.scrapeMpobStocks();
        if (it) scrapeItems.push(it);
      } catch (err) {
        console.warn("[gatherSources/mpob] swallowed:", errMsg(err));
      }
    }
    if (deps.scrapeBursaCpo) {
      try {
        scrapersFanout++;
        const it = await deps.scrapeBursaCpo();
        if (it) scrapeItems.push(it);
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
        if (it) scrapeItems.push(it);
      } catch (err) {
        console.warn(`[gatherSources/yahoo:${ticker}] swallowed:`, errMsg(err));
      }
    }
  }

  // -- Assembly (CAD-221) ---------------------------------------------------
  // 1. 48h freshness cut on the RSS pools (gnews + curated merged; the
  //    cut sorts dated items newest-first and keeps undated items last,
  //    so the two pools interleave by recency). Scrapes are exempt —
  //    price snapshots are the freshest data we have and usually undated.
  const fresh = applyFreshnessCut([...gnewsRaw, ...curatedItems]);
  // 2. Scrape items FIRST so price data (MPOB/Bursa/Yahoo — the anchor
  //    ICP's most valuable items) survives a busy RSS day, then RSS in
  //    recency order. 3. URL-level dedup — first occurrence wins, which
  //    encodes the same priority order.
  const deduped = dedupeByUrl([...scrapeItems, ...fresh.items]);

  // Cap + truncate excerpts so the composer prompt budget is bounded.
  const cappedRaw = deduped.items.slice(0, MAX_GATHERED_ITEMS);
  const gnewsSet = new Set(gnewsRaw);
  const gnewsInResult = cappedRaw.filter((i) => gnewsSet.has(i)).length;
  const capped = cappedRaw.map((it) => ({
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
      gnewsFeeds: gnewsFeeds.length,
      gnewsItems: gnewsInResult,
      dedupedCount: deduped.removed,
      freshnessDropped: fresh.dropped,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* URL normalization + dedup (CAD-221)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Canonical URL key for cross-source dedup: lowercase host (URL parser
 * does this), utm_* tracking params stripped, trailing slash(es) stripped.
 * Unparseable input is returned trimmed-as-is so it still dedups exact
 * duplicates. Exported for server/digest/run.ts to dedup the legacy
 * spec-bound RSS block against the gathered set.
 */
export function normalizeSourceUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url.trim();
  }
  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!/^utm_/i.test(k)) params.append(k, v);
  }
  const qs = params.toString();
  u.search = qs ? `?${qs}` : "";
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}

/**
 * Drop items whose normalized URL was already seen; FIRST occurrence wins,
 * so callers encode priority by input order (scrape > fresh RSS here).
 */
export function dedupeByUrl(
  items: readonly NormalizedSourceItem[]
): { items: NormalizedSourceItem[]; removed: number } {
  const seen = new Set<string>();
  const out: NormalizedSourceItem[] = [];
  let removed = 0;
  for (const it of items) {
    const key = normalizeSourceUrl(it.url);
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    out.push(it);
  }
  return { items: out, removed };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Touched-by-tests re-exports.
export { CURATED_FEEDS };
