/**
 * Claude Sonnet 4.6 Pro composer (CAD-87 / T-522).
 *
 * Pro-tier composer. Reuses the default composer's BriefJson schema,
 * extractor, citation parity check, and renderer — only the model id
 * and system prompt change. This is load-bearing: /b/<id> + Telegram
 * splitter + feedback eval all run on `BriefJson`, so the Pro path
 * MUST emit the same shape.
 *
 * What Pro changes:
 *   - Model: `claude-sonnet-4-5-20250929` (Sonnet 4.6 equivalent; the
 *     SDK alias `claude-sonnet-4-5` resolves to the latest snapshot).
 *     Per memory: "Sonnet 4.6" is internal naming for the 4-5 series
 *     in @ai-sdk/anthropic; do not switch to a literal "4-6" string
 *     until Anthropic publishes that snapshot.
 *   - Prompt: sharper, demands deeper synthesis, second-order
 *     implications, and tighter "why_it_matters" linkage to spec.
 *   - Higher maxTokens (Sonnet can sustain longer reasoning).
 *
 * Cost guard: 16K input / 6K reasoning / 3K output token caps per PRD.
 * We don't enforce input cap server-side (caller controls sources
 * bundle size); output cap is enforced via `maxTokens`.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { anthropicCostUsd, recordCost } from "@/server/cost/record";
import { buildProComposerSystemPrompt } from "./anthropic-pro-prompt";
import { renderBriefMarkdown } from "@/server/ai/composer/render";
import {
  composeBriefWithRepair,
  COMPOSE_USER_MESSAGE,
} from "@/server/ai/composer/compose";
import { ComposerJsonError } from "@/server/ai/composer/schema";
import { makeDeadLinkValidator } from "@/server/ai/composer/grounding-validate";
import type { ComposerInput, ComposerOutput } from "@/server/ai/composer/types";
import type { ComposerProvider } from "./types";

/**
 * Pro composer model. The `@ai-sdk/anthropic` provider maps this id to
 * the latest Sonnet snapshot. Update here (and in cost/record.ts
 * ANTHROPIC_PRICING) when Anthropic publishes a literal `sonnet-4-6`
 * snapshot id.
 */
export const PRO_COMPOSER_MODEL_ID = "claude-sonnet-4-5-20250929";

const PRO_MAX_OUTPUT_TOKENS = 3_000;

/**
 * Per-request timeout for the Sonnet 4.6 Pro composer (CAD-97).
 *
 * Sonnet on a long sources bundle + the deeper Pro prompt routinely takes
 * 30–45s — the AI SDK has no implicit timeout, so without this an upstream
 * hang would block the Inngest worker until the function-level timeout
 * fires. 60s = "long but legitimate" headroom; anything beyond that is
 * almost certainly a stuck connection.
 *
 * NOTE: providers MUST NOT retry on timeout — the digest pipeline owns
 * retry orchestration. See `types.ts` for the no-retry contract.
 */
export const PRO_COMPOSER_TIMEOUT_MS = 60_000;

export interface ProComposeDeps {
  /** CAD-226: injectable URL resolver for the dead-link validator (tests). */
  resolveImpl?: import("@/server/digest/sources/resolve").ResolveSourceUrlsFn;
}

export async function composeDigestPro(
  input: ComposerInput,
  deps: ProComposeDeps = {}
): Promise<ComposerOutput> {
  const systemPrompt = buildProComposerSystemPrompt(input);

  // CAD-219: the Pro composer runs through the SAME shared repair/retry
  // driver as the default Haiku composer (deterministic unused-source
  // prune, then at most ONE compose-only corrective retry). Each attempt
  // gets a fresh AbortSignal — the per-request timeout contract (CAD-97)
  // applies per model call, and timeouts are never retried here.
  let composed: Awaited<ReturnType<typeof composeBriefWithRepair>>;
  try {
    composed = await composeBriefWithRepair(
      async (correctiveAddendum) => {
        const result = await generateText({
          model: anthropic(PRO_COMPOSER_MODEL_ID),
          system: correctiveAddendum
            ? `${systemPrompt}\n\n${correctiveAddendum}`
            : systemPrompt,
          prompt: COMPOSE_USER_MESSAGE,
          temperature: 0.25,
          maxTokens: PRO_MAX_OUTPUT_TOKENS,
          abortSignal: AbortSignal.timeout(PRO_COMPOSER_TIMEOUT_MS),
        });
        return {
          text: result.text,
          inputTokens: result.usage?.promptTokens ?? 0,
          outputTokens: result.usage?.completionTokens ?? 0,
        };
      },
      {
        modelId: PRO_COMPOSER_MODEL_ID,
        digestRunId: input.digestRunId ?? null,
        // CAD-224 #4 (review finding 3): the deadline is checked right
        // after attempt 1, whose duration is capped at 60s by the per-call
        // AbortSignal — so it must sit BELOW that cap to ever fire. 50s:
        // a slow-but-successful first attempt with a defect skips the
        // retry (worst compose ~60s); fast attempts keep the retry.
        retryDeadlineAtMs: Date.now() + 50_000,
        // CAD-226: re-source any cited URL that fails to resolve.
        postParseValidate: makeDeadLinkValidator({ resolveImpl: deps.resolveImpl }),
      }
    );
  } catch (err) {
    // CAD-224 #2: record the failed spend before rethrowing.
    if (err instanceof ComposerJsonError && err.inputTokens !== undefined) {
      await recordCost({
        userId: input.userId ?? null,
        digestRunId: input.digestRunId ?? null,
        kind: "llm_call",
        provider: "anthropic",
        model: PRO_COMPOSER_MODEL_ID,
        inputTokens: err.inputTokens,
        outputTokens: err.outputTokens ?? 0,
        costUsd: anthropicCostUsd(
          PRO_COMPOSER_MODEL_ID,
          err.inputTokens,
          err.outputTokens ?? 0
        ),
      });
    }
    throw err;
  }

  const markdown = renderBriefMarkdown(composed.brief);

  // Tokens summed across attempts (1 or 2 calls); pricing is linear in
  // tokens, so one cost_events row with summed counts is dollar-exact.
  const costUsd = anthropicCostUsd(
    PRO_COMPOSER_MODEL_ID,
    composed.inputTokens,
    composed.outputTokens
  );

  await recordCost({
    userId: input.userId ?? null,
    digestRunId: input.digestRunId ?? null,
    kind: "llm_call",
    provider: "anthropic",
    model: PRO_COMPOSER_MODEL_ID,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    costUsd,
  });

  return {
    markdown,
    modelId: PRO_COMPOSER_MODEL_ID,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    costUsd,
    brief: composed.brief,
    repair: composed.repair,
  };
}

export const proComposerProvider: ComposerProvider = {
  id: "anthropic-sonnet-pro",
  modelId: PRO_COMPOSER_MODEL_ID,
  async compose(input: ComposerInput): Promise<ComposerOutput> {
    return composeDigestPro(input);
  },
};
