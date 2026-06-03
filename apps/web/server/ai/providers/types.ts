/**
 * Provider abstraction (CAD-85 / T-520, Phase 5.1 Pro Tier foundation).
 *
 * Cadence has two tiers of brief-generation stack:
 *
 *   - "default" — generic web search + Claude Haiku 4.5 composer.
 *                 ~$0.04–0.08 cost-to-us, 1 credit per brief.
 *   - "pro"     — Perplexity Sonar Reasoning Pro + Claude Sonnet 4.6.
 *                 ~$0.25–0.40 cost-to-us, 3 credits per brief.
 *                 Internal codename "pro"; user-facing copy is "🔬 Deep research".
 *
 * This file defines the narrow interfaces every provider must satisfy so
 * the digest pipeline can swap stacks without conditionals scattered
 * through `server/digest/run.ts`. Downstream consumers (Telegram render,
 * /b/<id> page, evals harness) MUST NOT depend on the provider behind
 * the scenes — they only see the unified `BriefJson` + cost metadata.
 *
 * See PRD: https://www.notion.so/Cadence-Pro-Tier-Higher-Stack-PRD-3732fa6da5b881e9a09bc0bb7adcaa8a
 */
import type { ComposerInput, ComposerOutput } from "@/server/ai/composer/types";

/**
 * Tier label. Persisted on `digest_runs.tier` (CAD-89) and used to look
 * up the right provider pair. Keep this list closed — adding tiers is a
 * deliberate decision (pricing + eval gate impact).
 */
export type Tier = "default" | "pro";

// ---------------------------------------------------------------------------
// Search provider
// ---------------------------------------------------------------------------

/**
 * Channel-neutral search result. Mirrors the subset of fields Brave +
 * Perplexity both reliably return; richer fields (reasoning trace,
 * relevance score, etc.) belong in provider-specific extensions, NOT
 * here.
 */
export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  /** ISO 8601 string when the provider gives us one. Optional — Brave's
   *  `age` field is fuzzy, Perplexity sometimes omits dates entirely. */
  publishedAt?: string;
}

export interface SearchOptions {
  /** Max results per query. Implementations clamp to their own ceiling. */
  count?: number;
  /** ISO-639-1, e.g. "en". Defaults to "en". */
  searchLang?: string;
  /** Country code, e.g. "MY". Defaults to "ALL". */
  country?: string;
  /** Cost-attribution metadata — for `cost_events` rollup. */
  userId?: string | null;
  digestRunId?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /** True if served from the provider's local cache (default tier does
   *  Postgres caching; Pro tier currently does not). */
  fromCache: boolean;
  /** USD cost of THIS search call (0 when cached). Useful for Pro tier
   *  metadata where per-brief cost matters. */
  costUsd: number;
}

export interface SearchProvider {
  /** Stable id for logs + cost_events.provider column. */
  readonly id: string;
  /** Run a single search query. */
  search(query: string, opts?: SearchOptions): Promise<SearchResponse>;
}

// ---------------------------------------------------------------------------
// Composer provider
// ---------------------------------------------------------------------------

/**
 * The composer takes (spec + sources) and produces a validated brief.
 * Pro and Default share the SAME `BriefJson` schema — only the
 * generation stack changes. This is load-bearing: /b/<id>, Telegram
 * rendering, and feedback eval all run on `BriefJson`.
 */
export interface ComposerProvider {
  /** Stable id for logs + cost_events.provider column. */
  readonly id: string;
  /** Model id string (e.g. `claude-sonnet-4-6`). Surfaced in metadata. */
  readonly modelId: string;
  /** Run the composer. Output is unchanged from the legacy `composeDigest`
   *  signature so the call site in `server/digest/run.ts` stays simple. */
  compose(input: ComposerInput): Promise<ComposerOutput>;
}

// ---------------------------------------------------------------------------
// Provider bundle
// ---------------------------------------------------------------------------

export interface ProviderBundle {
  tier: Tier;
  search: SearchProvider;
  composer: ComposerProvider;
}
