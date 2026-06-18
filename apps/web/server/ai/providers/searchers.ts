/**
 * Web-search provider registry (CAD-165 / CAD-228, Decisions Log D-011).
 *
 * The list of pluggable Searcher providers the Standard stack can use, keyed
 * by the id persisted on `digest_specs.searcher`. `resolveSearcher()` maps a
 * persisted id → SearchProvider (unknown/missing → Brave, the default).
 *
 * `searchWithFallback()` is the reliability seam: it runs the selected
 * provider and, on error OR empty results, falls back to DuckDuckGo (keyless)
 * so a lapsed Brave key (or a flaky provider) never denies a brief its web
 * search. Advanced tiers run their own search and do not use this registry.
 *
 * Keep SEARCHER_IDS in lockstep with the client list in
 * `lib/search-providers.ts` and the DB CHECK (migration 0031) — a structural
 * test guards the drift.
 */
import { defaultSearchProvider } from "./default";
import { duckduckgoSearchProvider } from "./duckduckgo";
import type { SearchOptions, SearchProvider, SearchResult } from "./types";

export const SEARCHER_IDS = ["brave", "duckduckgo"] as const;
export type SearcherId = (typeof SEARCHER_IDS)[number];

export const DEFAULT_SEARCHER_ID: SearcherId = "brave";
const FALLBACK_SEARCHER_ID: SearcherId = "duckduckgo";

export const SEARCHERS: Record<SearcherId, SearchProvider> = {
  brave: defaultSearchProvider,
  duckduckgo: duckduckgoSearchProvider,
};

export function isSearcherId(raw: unknown): raw is SearcherId {
  return (
    typeof raw === "string" && (SEARCHER_IDS as readonly string[]).includes(raw)
  );
}

export function normalizeSearcherId(raw: unknown): SearcherId {
  return isSearcherId(raw) ? raw : DEFAULT_SEARCHER_ID;
}

/** Resolve a persisted searcher id → SearchProvider (default Brave). */
export function resolveSearcher(raw: unknown): SearchProvider {
  return SEARCHERS[normalizeSearcherId(raw)];
}

/** Composer source shape (matches the {title,url,description,age} the
 *  pipeline already pushes onto `sources.search`). */
export interface WebSearchHit {
  title: string;
  url: string;
  description: string;
  age?: string;
}

function toHits(results: SearchResult[]): WebSearchHit[] {
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    description: r.snippet,
    age: r.publishedAt,
  }));
}

export interface FallbackSearchResult {
  hits: WebSearchHit[];
  /** Which provider actually produced the hits. */
  provider: string;
  /** True when the primary failed/empty and DuckDuckGo answered instead. */
  usedFallback: boolean;
}

/**
 * Run `primary` for `query`; on error OR empty results, fall back to
 * DuckDuckGo (keyless) — unless `primary` IS DuckDuckGo. Never throws: a
 * fully-failed search degrades to `[]`, and the brief still ships on its
 * RSS/scraper sources.
 */
export async function searchWithFallback(
  primary: SearchProvider,
  query: string,
  opts: SearchOptions = {}
): Promise<FallbackSearchResult> {
  try {
    const res = await primary.search(query, opts);
    if (res.results.length > 0) {
      return { hits: toHits(res.results), provider: primary.id, usedFallback: false };
    }
  } catch (err) {
    console.warn(
      `[searcher:${primary.id}] failed, trying DuckDuckGo fallback — ${(err as Error).message}`
    );
  }

  if (primary.id === FALLBACK_SEARCHER_ID) {
    // Primary already was DDG (or DDG returned empty) — nothing else to try.
    return { hits: [], provider: primary.id, usedFallback: false };
  }

  try {
    const res = await SEARCHERS[FALLBACK_SEARCHER_ID].search(query, opts);
    return {
      hits: toHits(res.results),
      provider: FALLBACK_SEARCHER_ID,
      usedFallback: true,
    };
  } catch (err) {
    console.warn(
      `[searcher:fallback] DuckDuckGo also failed — ${(err as Error).message}`
    );
    return { hits: [], provider: FALLBACK_SEARCHER_ID, usedFallback: true };
  }
}
