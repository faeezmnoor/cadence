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
import { parseAndValidateBrief } from "@/server/ai/composer/compose";
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

export async function composeDigestPro(
  input: ComposerInput
): Promise<ComposerOutput> {
  const systemPrompt = buildProComposerSystemPrompt(input);

  const result = await generateText({
    model: anthropic(PRO_COMPOSER_MODEL_ID),
    system: systemPrompt,
    prompt:
      "Compose the brief now. Emit ONE JSON object matching the contract. No preamble, no fences, no commentary.",
    temperature: 0.25,
    maxTokens: PRO_MAX_OUTPUT_TOKENS,
  });

  const brief = parseAndValidateBrief(result.text);
  const markdown = renderBriefMarkdown(brief);

  const inputTokens = result.usage?.promptTokens ?? 0;
  const outputTokens = result.usage?.completionTokens ?? 0;
  const costUsd = anthropicCostUsd(
    PRO_COMPOSER_MODEL_ID,
    inputTokens,
    outputTokens
  );

  await recordCost({
    userId: input.userId ?? null,
    digestRunId: input.digestRunId ?? null,
    kind: "llm_call",
    provider: "anthropic",
    model: PRO_COMPOSER_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
  });

  return {
    markdown,
    modelId: PRO_COMPOSER_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
    brief,
  };
}

export const proComposerProvider: ComposerProvider = {
  id: "anthropic-sonnet-pro",
  modelId: PRO_COMPOSER_MODEL_ID,
  async compose(input: ComposerInput): Promise<ComposerOutput> {
    return composeDigestPro(input);
  },
};
