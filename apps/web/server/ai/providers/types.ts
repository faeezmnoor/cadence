/**
 * # Provider retry/timeout contract (CAD-97)
 *
 * Providers (search + composer) MUST NOT implement their own retry loops.
 * Retry, fallback, refund, and circuit-breaker decisions all live in the
 * digest pipeline (`server/digest/run.ts`) and the Inngest function
 * boundary above it. Providers should:
 *
 *   - Apply a single per-request timeout (AbortSignal.timeout) sized to
 *     the slow tail of a *legitimate* call — see `PRO_COMPOSER_TIMEOUT_MS`
 *     in `anthropic-pro.ts` and `REQUEST_TIMEOUT_MS` in `perplexity.ts`.
 *   - Throw on timeout / non-2xx response. Do NOT catch-and-retry.
 *   - Let the pipeline decide whether a failure means: retry-same-tier,
 *     fall back to default tier (CAD-102), or refund the credit.
 *
 * Having retries in two places (provider + pipeline) is how brief cost
 * silently doubles and how the cost-overrun circuit breaker gets gamed.
 *
 * CAD-219 carve-out: the SHARED compose path (`composeBriefWithRepair` in
 * `server/ai/composer/compose.ts`) performs at most ONE compose-only
 * corrective re-prompt when the model's OUTPUT is malformed (bad JSON /
 * citation parity). That is an output-format repair, not a transport
 * retry — timeouts and non-2xx still throw immediately and remain
 * pipeline-owned. Providers still MUST NOT add their own retry loops.
 *
 * ---
 *
 * Provider abstraction (CAD-85 / T-520, Phase 5.1 Pro Tier foundation).
 *
 * Cadence has two tiers of brief-generation stack:
 *
 *   - "default" — generic web search + Claude Haiku 4.5 composer.
 *                 ~$0.04–0.08 cost-to-us, 1 credit per brief.
 *   - "pro"     — Perplexity Sonar Reasoning Pro + Claude Sonnet 4.6.
 *                 ~$0.25–0.40 cost-to-us, 3 credits per brief.
 *                 Internal codename "pro"; user-facing footer is
 *                 "🔬 Pro brief — deeper research, 3 credits." (CAD-91).
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
 *
 * CAD-222 / founder ruling 2026-06-11: "pro_websearch" is the bake-off
 * winner (Sonnet + Anthropic web-search server tool) promoted from
 * contender to a third selectable stack. Mirrors `ResearchStack` in
 * `lib/research-stack.ts` — the lib type is the user-facing registry,
 * this one is provider routing; keep them in lockstep.
 */
export type Tier = "default" | "pro" | "pro_websearch";

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
  /**
   * CAD-222 (bake-off contender A2): the provider's own synthesized
   * research answer, when it produces one (Perplexity Sonar emits a full
   * researched write-up alongside its citations — previously discarded).
   * Bounded by the provider (~4000 chars). Consumers pass it to the
   * composer as `ComposerInput.researchMemo`, where it is SECONDARY
   * material: the composer must verify every claim against the numbered
   * sources and may never cite the memo itself. Absent for providers
   * that return bare results (Brave).
   */
  memo?: string;
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
