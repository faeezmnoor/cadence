/**
 * Composer types (T-208).
 *
 * The composer turns:
 *   (DigestSpec, learned prefs, recent notes, fetched sources)
 * into a single Telegram-safe Markdown brief.
 */
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";
import type { BraveSearchResult } from "@/server/connectors/brave-search";

export interface ComposerSearchSource {
  query: string;
  results: BraveSearchResult[];
}

export interface ComposerRssSource {
  feedUrl: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string;
}

export interface ComposerPriceQuote {
  symbol: string;
  price: number;
  currency?: string;
  change24h?: number; // percent
  change7d?: number; // percent
}

export interface ComposerSourcesBundle {
  /** Brave Search bundles keyed by topic / query. */
  search: ComposerSearchSource[];
  /** RSS items pre-filtered to last N hours. */
  rss: ComposerRssSource[];
  /** Optional — present when T-206 yfinance microservice is live. */
  prices?: ComposerPriceQuote[];
}

export interface ComposerInput {
  spec: DigestSpecV1;
  sources: ComposerSourcesBundle;
  /** ≤5 distilled bullet preferences (T-405 feeds this later). */
  distilledPrefs?: string[];
  /** Last 5 raw learning_log entries (most-recent-first). */
  recentRawNotes?: string[];
  /** For cost attribution. */
  userId?: string | null;
  digestRunId?: string | null;
}

/**
 * CAD-219 self-repair telemetry. Populated by the shared compose path when
 * a brief needed fixing before it validated. OPTIONAL end-to-end: the
 * digest pipeline may stamp it onto run metadata later, and nothing breaks
 * while it's unwired.
 */
export interface ComposerRepairInfo {
  /** Never-cited sources dropped by the deterministic $0 prune+renumber. */
  prunedUnused?: number;
  /** Compose-only corrective LLM retries performed (bounded to 1). */
  composeRetries?: number;
}

export interface ComposerOutput {
  /** Final Markdown brief — pre-split for Telegram. */
  markdown: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /**
   * Present only when the brief needed repair (deterministic prune and/or
   * one compose-only retry). Absent on the clean path. See CAD-219.
   */
  repair?: ComposerRepairInfo;
  /**
   * Structured brief the renderer turned into markdown. Exposed so the
   * digest pipeline can run downstream evals (Phase 0: source-resolution
   * check pings every `brief.sources[].url`). Kept as `unknown` here to
   * avoid a circular type import from `./schema`; the actual shape is
   * `BriefJson` from `./schema.ts`. Callers that need typing should
   * import that type and assert.
   */
  brief: unknown;
}
