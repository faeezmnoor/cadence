/**
 * DuckDuckGo search provider (CAD-165).
 *
 * Thin SearchProvider adapter over the keyless DDG HTML connector, so the
 * registry (searchers.ts) can route to it like any other provider. Keyless
 * → costUsd 0. Mirrors the `defaultSearchProvider` (Brave) adapter shape.
 */
import { duckDuckGoSearch } from "@/server/connectors/duckduckgo";
import type { SearchOptions, SearchProvider, SearchResponse } from "./types";

export const duckduckgoSearchProvider: SearchProvider = {
  id: "duckduckgo",
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const res = await duckDuckGoSearch(query, {
      count: opts.count,
      userId: opts.userId,
      digestRunId: opts.digestRunId,
    });
    return {
      query: res.query,
      results: res.results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
      })),
      fromCache: false,
      costUsd: 0,
    };
  },
};
