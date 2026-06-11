/**
 * Dynamic Google News RSS feeds per entity/keyword — CAD-221 (recall pack).
 *
 * The competitor-watch ICP fails when spec.entities.companies and
 * spec.keywords_include never drive retrieval. This module turns those
 * terms into Google-News-RSS-proxy feeds — the exact pattern already
 * used by the curated BNM / SC Malaysia feeds in ./feeds.ts — so entity
 * recall costs $0 COGS and flows through the existing aggregate path.
 *
 * Pure function: no network, no state. gatherSources() builds these
 * per-call from the spec and aggregates them alongside CURATED_FEEDS.
 */
import type { CuratedFeed } from "./feeds";

/** Hard cap on dynamic Google News terms per brief (companies first). */
export const MAX_GNEWS_TERMS = 4;
/** Terms shorter than this are too ambiguous to quote-search ("AI", "MY"). */
export const GNEWS_TERM_MIN_CHARS = 3;
/** Terms longer than this are sentences, not entities — skip them. */
export const GNEWS_TERM_MAX_CHARS = 60;
/**
 * Topic tag stamped on every dynamic feed. Not present in TOPIC_KEYWORDS
 * on purpose — these feeds are built directly from the spec's entities/
 * keywords, not routed via bucket matching. The tag exists so the feeds
 * satisfy the CuratedFeed shape and stay identifiable in telemetry.
 */
export const GNEWS_TOPIC = "gnews";

/**
 * Stable slug for a term: lowercase, non-alphanumeric runs collapse to a
 * single hyphen, edges trimmed. "Sime Darby Bhd." → "sime-darby-bhd".
 * Used in the feed id (`gnews-<slug>`) so telemetry stays greppable.
 */
export function slugifyGnewsTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Quoted-exact-match Google News RSS search URL, MY-localised. Encoding
 * matches the curated bnm-announcements-gnews pattern: quotes become %22
 * and spaces become `+`.
 */
export function gnewsSearchUrl(term: string): string {
  const q = encodeURIComponent(`"${term}"`).replace(/%20/g, "+");
  return `https://news.google.com/rss/search?q=${q}&hl=en-MY&gl=MY&ceid=MY:en`;
}

/**
 * Build up to MAX_GNEWS_TERMS Google News feeds from the spec's hard
 * anchors. Companies take priority over keywords (the competitor-watch
 * ICP names companies; keywords are the looser net). Terms are trimmed,
 * deduped case-insensitively (and by slug, so "Sime Darby" / "sime-darby"
 * can't mint two feeds), and skipped when <GNEWS_TERM_MIN_CHARS or
 * >GNEWS_TERM_MAX_CHARS.
 */
export function buildGnewsFeeds(input: {
  companies: readonly string[];
  keywords: readonly string[];
}): CuratedFeed[] {
  const seenTerms = new Set<string>();
  const seenSlugs = new Set<string>();
  const out: CuratedFeed[] = [];

  for (const raw of [...input.companies, ...input.keywords]) {
    if (out.length >= MAX_GNEWS_TERMS) break;
    const term = raw.trim();
    if (term.length < GNEWS_TERM_MIN_CHARS || term.length > GNEWS_TERM_MAX_CHARS) {
      continue;
    }
    const key = term.toLowerCase();
    if (seenTerms.has(key)) continue;
    const slug = slugifyGnewsTerm(term);
    if (!slug || seenSlugs.has(slug)) continue;
    seenTerms.add(key);
    seenSlugs.add(slug);
    out.push({
      id: `gnews-${slug}`,
      label: `Google News: ${term}`,
      url: gnewsSearchUrl(term),
      topics: [GNEWS_TOPIC],
    });
  }
  return out;
}
