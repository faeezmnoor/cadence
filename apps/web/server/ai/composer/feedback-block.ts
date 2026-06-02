/**
 * Composer feedback block builder (T-404 / CAD-45).
 *
 * Hybrid injection model:
 *   1. `users.distilled_prefs` — canonical, terse, weighted bias from the
 *      weekly distill job (T-405). Stable across briefs.
 *   2. Recent raw `learning_log` rows where `distilled_at IS NULL`,
 *      newest-first, verbatim user input prefixed by date. This is the
 *      "/tune takes effect on the *next* brief" path — we don't wait
 *      for the weekly distill.
 *
 * Both are squeezed into a hard 500-token budget. Distilled goes first
 * (it's already curated); raw rows fill remaining budget until we'd
 * overflow.
 *
 * Token counting: fast `length/4` approximation. Anthropic/Claude
 * tokenization is roughly 3.5-4 chars per token for English; for short
 * Malay/Chinese phrases it's a bit pessimistic, which is fine — we'd
 * rather under-fill than overflow the soft cap.
 *
 * The returned block is framed as a soft directive (the composer system
 * prompt already wraps it under "LEARNED PREFERENCES" + "RECENT
 * FEEDBACK" headings, so the LLM treats it as bias, not user content
 * to echo).
 */

export const FEEDBACK_BLOCK_TOKEN_CAP = 500;

/** Fast char-based token approximation. Don't add a tokenizer dep. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface LearningLogLite {
  id: string;
  rawText: string;
  createdAt: Date;
}

export interface BuildFeedbackBlockArgs {
  /** Already-shaped distilled prefs from `users.distilled_prefs` (T-405). */
  distilledPrefs: string[] | null | undefined;
  /** Candidate raw rows (newest-first), pre-filtered to distilled_at IS NULL. */
  rawCandidates: LearningLogLite[];
  /** Override for tests. */
  tokenCap?: number;
}

export interface BuiltFeedbackBlock {
  /** Distilled bullets that fit in the cap (verbatim, in input order). */
  distilledPrefs: string[];
  /**
   * Raw notes formatted as `YYYY-MM-DD: <rawText>` (newest first), only
   * those that fit in the remaining budget.
   */
  recentRawNotes: string[];
  /** Ids of raw rows actually included — caller stamps consumed_at on these. */
  consumedRawIds: string[];
  /** Approx tokens used by the assembled block. */
  approxTokensUsed: number;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pure builder. No DB access. Caller is responsible for:
 *   - querying `users.distilled_prefs` + recent `learning_log` rows
 *   - stamping `consumed_at` on rows returned in `consumedRawIds`
 */
export function buildFeedbackBlock(args: BuildFeedbackBlockArgs): BuiltFeedbackBlock {
  const cap = args.tokenCap ?? FEEDBACK_BLOCK_TOKEN_CAP;

  const distilledOut: string[] = [];
  let used = 0;

  for (const bullet of args.distilledPrefs ?? []) {
    const cost = approxTokens(`- ${bullet}\n`);
    if (used + cost > cap) break;
    distilledOut.push(bullet);
    used += cost;
  }

  const rawOut: string[] = [];
  const consumedIds: string[] = [];

  for (const row of args.rawCandidates) {
    // Skip empty/whitespace-only rows defensively (shouldn't happen — tune
    // command rejects empties — but learning_log accepts arbitrary text).
    const trimmed = row.rawText.trim();
    if (!trimmed) continue;

    const formatted = `${fmtDate(row.createdAt)}: ${trimmed}`;
    const cost = approxTokens(`- ${formatted}\n`);
    if (used + cost > cap) break;

    rawOut.push(formatted);
    consumedIds.push(row.id);
    used += cost;
  }

  return {
    distilledPrefs: distilledOut,
    recentRawNotes: rawOut,
    consumedRawIds: consumedIds,
    approxTokensUsed: used,
  };
}
