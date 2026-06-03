/**
 * Cost tracking. Every paid call (LLM, search, prices) writes a
 * cost_events row. Run-level cost rollup happens later by SUM() over
 * digest_run_id.
 *
 * Pricing tables (USD per 1M tokens) — keep in sync with provider docs.
 * Source: Anthropic pricing page, OpenAI pricing page, Brave pricing.
 * Tiny per-call dollar amounts, so we store as numeric(10,5).
 */
import { db } from "@/server/db/client";
import { costEvents } from "@/server/db/schema";

export type CostKind = "llm_call" | "search_api" | "price_api";
export type CostProvider =
  | "anthropic"
  | "openai"
  | "brave"
  | "yfinance"
  // Pro-tier providers (CAD-86, CAD-87). cost_events.provider column
  // is `text`, not an enum, so adding values here is a type-only change.
  | "perplexity";

interface RecordCostArgs {
  userId?: string | null;
  digestRunId?: string | null;
  kind: CostKind;
  provider: CostProvider;
  model?: string; // currently unused in schema; logged in console for now
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
}

export async function recordCost(args: RecordCostArgs): Promise<void> {
  const { userId, digestRunId, kind, provider, inputTokens, outputTokens, costUsd } = args;
  try {
    await db.insert(costEvents).values({
      userId: userId ?? null,
      digestRunId: digestRunId ?? null,
      kind,
      provider,
      inputTokens: inputTokens ?? null,
      outputTokens: outputTokens ?? null,
      costUsd: costUsd.toFixed(5),
    });
  } catch (err) {
    // Cost-tracking failures must never break a digest delivery.
    console.error("[cost] write failed", { provider, kind, costUsd, err });
  }
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

/** Anthropic pricing per 1M tokens, USD. */
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
};

export function anthropicCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price =
    ANTHROPIC_PRICING[modelId] ??
    // Fall back to haiku-4-5 pricing rather than 0; under-counting is worse
    // than over-counting because it hides cost from the side-income lens.
    ANTHROPIC_PRICING["claude-haiku-4-5-20251001"];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Brave Search: ~$3 per 1k queries on Data for AI tier. Round to 0.003/req. */
export function braveCostUsd(): number {
  return 0.003;
}
