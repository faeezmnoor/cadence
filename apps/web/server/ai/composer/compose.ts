/**
 * Composer entry point (T-208, CAD-31, brief-template-v1, CAD-219).
 *
 * Pipeline:
 *   1. Build the system prompt (template + 2 few-shots, JSON output contract).
 *   2. Call Claude Haiku 4.5; the model emits a JSON object.
 *   3. Extract JSON from the raw response (handles fences / preamble).
 *   4. Validate against `briefJsonSchema` (Zod).
 *   5. Check citation parity (every [n] has a source; every source cited).
 *      CAD-219: unused-source-only defects are repaired deterministically
 *      ($0 prune + renumber); other defects get ONE compose-only retry with
 *      a corrective addendum before throwing ComposerJsonError.
 *   6. Render to channel-neutral markdown via `renderBriefMarkdown`.
 *   7. Record cost (tokens summed across attempts).
 *
 * Model id: `claude-haiku-4-5-20251001`.
 *
 * Channel-agnostic: this function does not know or care that Telegram is
 * the current delivery channel. Splitter / dispatcher are downstream.
 *
 * The repair/retry driver (`composeBriefWithRepair`) is SHARED: the Pro
 * Sonnet composer (`server/ai/providers/anthropic-pro.ts`) injects its own
 * model call but runs the identical parse → repair → bounded-retry logic,
 * so parity validation stays in exactly one place.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { anthropicCostUsd, recordCost } from "@/server/cost/record";
import { log } from "@/lib/log";
import { buildComposerSystemPrompt } from "./prompt";
import { renderBriefMarkdown } from "./render";
import {
  briefJsonSchema,
  checkCitationParity,
  ComposerJsonError,
  extractJsonObject,
  pruneUnusedSources,
  type BriefJson,
} from "./schema";
import type {
  ComposerInput,
  ComposerOutput,
  ComposerRepairInfo,
} from "./types";

const COMPOSER_MODEL_ID = "claude-haiku-4-5-20251001";

/**
 * CAD-219: raised from 2400 → 3000. Anthropic bills only the tokens
 * actually generated, so the higher cap costs nothing on a normal brief —
 * whereas a brief truncated mid-JSON at the old cap fails parsing, and a
 * thrown ComposerJsonError classifies transient (server/digest/errors.ts)
 * → up to 3 FULL pipeline re-runs (re-search + re-compose ≈ 3× brief
 * cost). Truncation is the expensive path; headroom is free.
 */
export const COMPOSER_MAX_OUTPUT_TOKENS = 3_000;

/** Shared user-turn message — identical for default and Pro composers. */
export const COMPOSE_USER_MESSAGE =
  "Compose the brief now. Emit ONE JSON object matching the contract. No preamble, no fences, no commentary.";

export async function composeDigest(
  input: ComposerInput
): Promise<ComposerOutput> {
  const systemPrompt = buildComposerSystemPrompt(input);

  const composed = await composeBriefWithRepair(
    async (correctiveAddendum) => {
      const result = await generateText({
        model: anthropic(COMPOSER_MODEL_ID),
        system: correctiveAddendum
          ? `${systemPrompt}\n\n${correctiveAddendum}`
          : systemPrompt,
        prompt: COMPOSE_USER_MESSAGE,
        temperature: 0.3,
        maxTokens: COMPOSER_MAX_OUTPUT_TOKENS,
      });
      return {
        text: result.text,
        inputTokens: result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.completionTokens ?? 0,
      };
    },
    { modelId: COMPOSER_MODEL_ID, digestRunId: input.digestRunId ?? null }
  );

  const markdown = renderBriefMarkdown(composed.brief);

  // Tokens are summed across attempts (1 or 2 model calls). Anthropic
  // pricing is linear in tokens, so one cost_events row with the summed
  // counts is dollar-exact; we keep one row per logical compose.
  const costUsd = anthropicCostUsd(
    COMPOSER_MODEL_ID,
    composed.inputTokens,
    composed.outputTokens
  );

  await recordCost({
    userId: input.userId ?? null,
    digestRunId: input.digestRunId ?? null,
    kind: "llm_call",
    provider: "anthropic",
    model: COMPOSER_MODEL_ID,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    costUsd,
  });

  return {
    markdown,
    modelId: COMPOSER_MODEL_ID,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    costUsd,
    brief: composed.brief,
    repair: composed.repair,
  };
}

// ---------------------------------------------------------------------------
// CAD-219 — shared parse → deterministic repair → bounded retry driver
// ---------------------------------------------------------------------------

/** Classified output defect from one compose attempt. */
export type ComposeDefect =
  | { kind: "invalid_json"; detail: string }
  | { kind: "invalid_schema"; detail: string }
  | {
      kind: "citation_parity";
      missingSources: number[];
      unusedSources: number[];
      /** Markers actually declared in `sources[]`, ascending. */
      declaredMarkers: number[];
    };

export type BriefParseOutcome =
  | { ok: true; brief: BriefJson; prunedUnused: number }
  | { ok: false; defect: ComposeDefect; message: string };

/**
 * Parse + validate one raw model response, applying the deterministic
 * unused-source repair when applicable. Pure — no I/O, no LLM call.
 *
 * Failure messages intentionally match the pre-CAD-219 ComposerJsonError
 * strings so logs and downstream matching stay stable.
 */
export function parseBriefOutcome(raw: string): BriefParseOutcome {
  let parsed: unknown;
  try {
    parsed = extractJsonObject(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      defect: { kind: "invalid_json", detail },
      message: detail,
    };
  }

  const result = briefJsonSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      defect: { kind: "invalid_schema", detail: result.error.message },
      message: `brief JSON schema validation failed: ${result.error.message}`,
    };
  }

  const brief = result.data;
  const parity = checkCitationParity(brief);
  if (parity.ok) return { ok: true, brief, prunedUnused: 0 };

  // Cosmetic defect (declared-but-never-cited sources, nothing missing):
  // repair in pure code for $0 instead of failing the whole pipeline.
  const repaired = pruneUnusedSources(brief);
  if (repaired) {
    return {
      ok: true,
      brief: repaired.brief,
      prunedUnused: repaired.prunedUnused,
    };
  }

  const bits: string[] = [];
  if (parity.missingSources.length > 0) {
    bits.push(
      `missing sources for markers [${parity.missingSources.join(",")}]`
    );
  }
  if (parity.unusedSources.length > 0) {
    bits.push(
      `unused sources for markers [${parity.unusedSources.join(",")}]`
    );
  }
  return {
    ok: false,
    defect: {
      kind: "citation_parity",
      missingSources: parity.missingSources,
      unusedSources: parity.unusedSources,
      declaredMarkers: brief.sources
        .map((s) => s.marker)
        .sort((a, b) => a - b),
    },
    message: `citation parity failed: ${bits.join("; ")}`,
  };
}

/**
 * Short corrective system-prompt addendum for the ONE compose-only retry.
 * Describes the exact defect of the previous attempt so the model can fix
 * it without re-deriving the whole brief from scratch.
 */
export function buildCorrectiveAddendum(defect: ComposeDefect): string {
  const header =
    "CORRECTION REQUIRED — your previous answer was rejected. Re-emit the FULL corrected JSON object (same contract: ONE JSON object, no preamble, no fences, no commentary). The specific defect:";
  switch (defect.kind) {
    case "invalid_json":
      return (
        `${header}\n` +
        `Your previous answer was not a single valid JSON object (${defect.detail}). ` +
        `It may have been truncated mid-JSON. Emit the COMPLETE object from the opening { to the closing }, ` +
        `and keep bullets concise so the whole object fits within the output budget.`
      );
    case "invalid_schema":
      return (
        `${header}\n` +
        `Your previous answer's JSON did not match the required schema: ${truncateDetail(defect.detail)}`
      );
    case "citation_parity": {
      const lines: string[] = [];
      if (defect.missingSources.length > 0) {
        lines.push(
          `Your previous answer cited marker(s) [${defect.missingSources.join("], [")}] in the text, ` +
            `but the "sources" array only declares marker(s) ${
              defect.declaredMarkers.join(", ") || "(none)"
            }. Every [n] cited in tldr/sections/why_it_matters MUST have a matching sources[] entry. ` +
            `Do NOT invent sources — cite only the source material you were given.`
        );
      }
      if (defect.unusedSources.length > 0) {
        lines.push(
          `Source marker(s) ${defect.unusedSources.join(", ")} are declared in "sources" but never cited ` +
            `in the text. Cite every declared source at least once, or omit it from "sources".`
        );
      }
      return `${header}\n${lines.join("\n")}`;
    }
  }
}

function truncateDetail(detail: string, max = 600): string {
  return detail.length <= max ? detail : `${detail.slice(0, max)}…`;
}

/** One model invocation's raw output + usage. */
export interface ComposerModelAttempt {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ComposeWithRepairResult {
  brief: BriefJson;
  /** Token totals summed across attempts (1 or 2 model calls). */
  inputTokens: number;
  outputTokens: number;
  /** Present only when something needed fixing. */
  repair?: ComposerRepairInfo;
}

/**
 * Shared parse → repair → bounded-retry driver for ALL composer providers.
 * Default (Haiku) and Pro (Sonnet) both run through this; only the model
 * call is injected, so parity/parse semantics cannot diverge per provider.
 *
 * CAD-219 semantics, in order:
 *   1. Deterministic repair ($0): unused-but-declared sources are pruned
 *      and markers renumbered in pure code (`pruneUnusedSources`). No
 *      throw, no extra LLM call, content never altered.
 *   2. ONE compose-only retry: on missing-source parity, JSON parse /
 *      truncation, or schema failure, re-call the model once with a short
 *      corrective addendum. Cost: a compose retry ≈ $0.002–0.01 (one extra
 *      LLM call on the same input) vs $0.02–0.03 for the full pipeline
 *      re-run (re-search + re-compose) that a thrown ComposerJsonError
 *      triggers — classifyError marks it transient → up to 3 re-runs.
 *   3. If the retry also fails, throw ComposerJsonError exactly as before.
 *      Pipeline retry semantics are unchanged as the last resort.
 *
 * NOTE on the CAD-97 "providers must not retry" contract
 * (server/ai/providers/types.ts): that contract forbids TRANSPORT-level
 * retries (timeouts, 5xx) so the pipeline stays the single retry owner.
 * This is a bounded output-format correction in the shared compose path,
 * deliberately carved out by CAD-219. Timeouts and network errors from
 * `callModel` still propagate immediately — they are never retried here.
 */
export async function composeBriefWithRepair(
  callModel: (correctiveAddendum?: string) => Promise<ComposerModelAttempt>,
  ctx: { modelId: string; digestRunId?: string | null }
): Promise<ComposeWithRepairResult> {
  const first = await callModel();
  let inputTokens = first.inputTokens;
  let outputTokens = first.outputTokens;

  const firstOutcome = parseBriefOutcome(first.text);
  if (firstOutcome.ok) {
    logPrunedRepair(firstOutcome.prunedUnused, 0, ctx);
    return {
      brief: firstOutcome.brief,
      inputTokens,
      outputTokens,
      repair: buildRepairInfo(firstOutcome.prunedUnused, 0),
    };
  }

  log.warn("composer: output defect — running one compose-only retry", {
    model: ctx.modelId,
    digestRunId: ctx.digestRunId ?? null,
    defect: firstOutcome.defect.kind,
    message: firstOutcome.message,
  });

  const second = await callModel(buildCorrectiveAddendum(firstOutcome.defect));
  inputTokens += second.inputTokens;
  outputTokens += second.outputTokens;

  const secondOutcome = parseBriefOutcome(second.text);
  if (secondOutcome.ok) {
    logPrunedRepair(secondOutcome.prunedUnused, 1, ctx);
    return {
      brief: secondOutcome.brief,
      inputTokens,
      outputTokens,
      repair: buildRepairInfo(secondOutcome.prunedUnused, 1),
    };
  }

  // Last resort — identical to pre-CAD-219 behavior: throw and let the
  // digest pipeline's classify/retry machinery take over.
  throw new ComposerJsonError(secondOutcome.message);
}

function buildRepairInfo(
  prunedUnused: number,
  composeRetries: number
): ComposerRepairInfo | undefined {
  if (prunedUnused === 0 && composeRetries === 0) return undefined;
  const info: ComposerRepairInfo = {};
  if (prunedUnused > 0) info.prunedUnused = prunedUnused;
  if (composeRetries > 0) info.composeRetries = composeRetries;
  return info;
}

function logPrunedRepair(
  prunedUnused: number,
  composeRetries: number,
  ctx: { modelId: string; digestRunId?: string | null }
): void {
  if (prunedUnused === 0) return;
  log.warn("composer: pruned unused sources (deterministic repair)", {
    model: ctx.modelId,
    digestRunId: ctx.digestRunId ?? null,
    prunedUnused,
    composeRetries,
  });
}

/**
 * Exported for tests and offline tooling (sample-brief generator).
 * Validates shape AND citation parity. CAD-219: an unused-source-only
 * parity defect is repaired deterministically (prune + renumber) instead
 * of throwing. Throws ComposerJsonError on every other failure.
 */
export function parseAndValidateBrief(raw: string): BriefJson {
  const outcome = parseBriefOutcome(raw);
  if (!outcome.ok) throw new ComposerJsonError(outcome.message);
  return outcome.brief;
}

export { COMPOSER_MODEL_ID };
