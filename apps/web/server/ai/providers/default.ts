/**
 * Default tier providers (CAD-85 / T-520).
 *
 * Thin adapters that wrap the existing Brave Search + Claude Haiku 4.5
 * composer behind the unified `SearchProvider` / `ComposerProvider`
 * interfaces. NO behavior change vs the pre-abstraction call path —
 * `digest/run.ts` produces byte-identical output when wired through
 * these adapters.
 *
 * Why thin: the legacy `braveSearch` and `composeDigest` functions
 * already handle caching, cost tracking, and the BriefJson contract.
 * Re-implementing them here would diverge over time. We adapt, we
 * don't fork.
 */
import { braveSearch } from "@/server/connectors/brave-search";
import { composeDigest, COMPOSER_MODEL_ID } from "@/server/ai/composer/compose";
import type { ComposerInput, ComposerOutput } from "@/server/ai/composer/types";
import { braveCostUsd } from "@/server/cost/record";
import type {
  ComposerProvider,
  SearchOptions,
  SearchProvider,
  SearchResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Default search — Brave Web Search
// ---------------------------------------------------------------------------

export const defaultSearchProvider: SearchProvider = {
  id: "brave",
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const res = await braveSearch(query, {
      count: opts.count,
      searchLang: opts.searchLang,
      country: opts.country,
      userId: opts.userId,
      digestRunId: opts.digestRunId,
    });
    return {
      query: res.query,
      results: res.results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.description,
        publishedAt: r.age,
      })),
      fromCache: res.fromCache,
      // Brave: live call = $0.003, cached = $0. The legacy connector
      // already wrote the cost_events row, so this is informational
      // only (do not double-count).
      costUsd: res.fromCache ? 0 : braveCostUsd(),
    };
  },
};

// ---------------------------------------------------------------------------
// Default composer — Claude Haiku 4.5
// ---------------------------------------------------------------------------

export const defaultComposerProvider: ComposerProvider = {
  id: "anthropic-haiku",
  modelId: COMPOSER_MODEL_ID,
  async compose(input: ComposerInput): Promise<ComposerOutput> {
    return composeDigest(input);
  },
};
