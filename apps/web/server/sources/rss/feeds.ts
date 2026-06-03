/**
 * Curated RSS feed library — Phase 6a Ticket 2 (CAD-113).
 *
 * These are the free, no-key, ToS-clean feeds from the research doc
 * strategy/free-data-source-plan-v1.md §1.  RSS is "the highest
 * signal-to-effort source category in the entire doc" (§2 Pattern C).
 *
 * Topic mapping is intentionally coarse — the composer-side router
 * (apps/web/server/sources/index.ts) does the fuzzy keyword match. Adding
 * a feed to a new topic = a one-line config change here, not a code change.
 *
 * Initial 17 feeds covering: commodities (anchor ICP-1), Malaysia local
 * news, regulatory, tech / B2B ops, and crypto. Sport / niche packs come
 * in Phase 6b.
 */

export interface CuratedFeed {
  /** Stable handle used in NormalizedSourceItem.source_id. */
  id: string;
  /** Human label for admin UI / brief footer. */
  label: string;
  url: string;
  /** Coarse topic buckets — see TOPIC_KEYWORDS in ../index.ts. */
  topics: readonly string[];
}

export const CURATED_FEEDS: readonly CuratedFeed[] = [
  // --- Commodities / agri (ICP-1 anchor) ---
  {
    id: "bernama-agri",
    label: "Bernama — Agri & Commodities",
    url: "https://www.bernama.com/en/business/rss/news_business.xml",
    topics: ["commodities", "palm_oil", "agri", "malaysia"],
  },
  {
    id: "usda-news",
    label: "USDA News Releases",
    url: "https://www.usda.gov/rss/latest-releases.xml",
    topics: ["commodities", "agri", "palm_oil"],
  },
  {
    id: "reuters-commodities-gnews",
    label: "Reuters Commodities (Google News)",
    url: "https://news.google.com/rss/search?q=site:reuters.com+commodities&hl=en-US&gl=US&ceid=US:en",
    topics: ["commodities", "palm_oil", "oil_gas"],
  },
  {
    id: "the-edge-my",
    label: "The Edge Malaysia",
    url: "https://www.theedgemarkets.com/rss.xml",
    topics: ["malaysia", "equities", "commodities", "regulatory"],
  },

  // --- Malaysia local news (cross-cuts every MY-based ICP) ---
  {
    id: "malay-mail-business",
    label: "Malay Mail — Money",
    url: "https://www.malaymail.com/feed/rss/money",
    topics: ["malaysia", "business", "equities"],
  },
  {
    id: "the-star-business",
    label: "The Star — Business",
    url: "https://www.thestar.com.my/rss/business",
    topics: ["malaysia", "business", "equities"],
  },
  {
    id: "fmt-business",
    label: "Free Malaysia Today — Business",
    url: "https://www.freemalaysiatoday.com/category/business/feed/",
    topics: ["malaysia", "business"],
  },
  {
    id: "channel-news-asia-business",
    label: "Channel News Asia — Business",
    url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936",
    topics: ["sea", "business", "equities"],
  },

  // --- Tech / B2B ops (ICP-2) ---
  {
    id: "techcrunch",
    label: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    topics: ["tech", "saas", "startups"],
  },
  {
    id: "hacker-news-front",
    label: "Hacker News — Front Page",
    url: "https://hnrss.org/frontpage",
    topics: ["tech", "saas"],
  },
  {
    id: "producthunt",
    label: "Product Hunt",
    url: "https://www.producthunt.com/feed",
    topics: ["tech", "saas", "startups"],
  },
  {
    id: "tech-in-asia",
    label: "Tech in Asia",
    url: "https://www.techinasia.com/rss",
    topics: ["sea", "tech", "startups"],
  },

  // --- Crypto (ICP-6 subset, easy free coverage) ---
  {
    id: "cryptopanic",
    label: "CryptoPanic — All",
    url: "https://cryptopanic.com/news/rss/",
    topics: ["crypto"],
  },
  {
    id: "coindesk",
    label: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    topics: ["crypto"],
  },

  // --- Regulatory / Gov (ICP-3, ICP-9) ---
  {
    id: "bnm-announcements-gnews",
    label: "Bank Negara Malaysia (Google News)",
    url: "https://news.google.com/rss/search?q=%22Bank+Negara+Malaysia%22&hl=en-MY&gl=MY&ceid=MY:en",
    topics: ["regulatory", "malaysia", "banking"],
  },
  {
    id: "sc-malaysia-gnews",
    label: "Securities Commission MY (Google News)",
    url: "https://news.google.com/rss/search?q=%22Securities+Commission+Malaysia%22&hl=en-MY&gl=MY&ceid=MY:en",
    topics: ["regulatory", "malaysia", "equities"],
  },

  // --- Single-company / equities tail (ICP-4 + ICP-7) ---
  {
    id: "crunchbase-news",
    label: "Crunchbase News",
    url: "https://news.crunchbase.com/feed/",
    topics: ["startups", "tech", "funding"],
  },
] as const;

/**
 * Return feed URLs whose `topics` intersect any of the given query topics.
 * If no query topics are supplied, returns all feeds (caller's choice to
 * fan out; defensive — but the composer's router should always pass
 * topics, otherwise we'd over-fetch).
 */
export function feedsForTopics(
  topics: readonly string[]
): readonly CuratedFeed[] {
  if (topics.length === 0) return CURATED_FEEDS;
  const wanted = new Set(topics.map((t) => t.toLowerCase()));
  return CURATED_FEEDS.filter((f) =>
    f.topics.some((t) => wanted.has(t.toLowerCase()))
  );
}
