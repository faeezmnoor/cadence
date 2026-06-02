/**
 * Composer entry point (T-208, CAD-31, brief-template-v1).
 *
 * Pipeline:
 *   1. Build the system prompt (template + 2 few-shots, JSON output contract).
 *   2. Call Claude Haiku 4.5; the model emits a JSON object.
 *   3. Extract JSON from the raw response (handles fences / preamble).
 *   4. Validate against `briefJsonSchema` (Zod).
 *   5. Check citation parity (every [n] has a source; every source cited).
 *   6. Render to channel-neutral markdown via `renderBriefMarkdown`.
 *   7. Record cost.
 *
 * Model id: `claude-haiku-4-5-20251001`.
 *
 * Channel-agnostic: this function does not know or care that Telegram is
 * the current delivery channel. Splitter / dispatcher are downstream.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { anthropicCostUsd, recordCost } from "@/server/cost/record";
import { buildComposerSystemPrompt } from "./prompt";
import { renderBriefMarkdown } from "./render";
import {
  briefJsonSchema,
  checkCitationParity,
  ComposerJsonError,
  extractJsonObject,
  type BriefJson,
} from "./schema";
import type { ComposerInput, ComposerOutput } from "./types";

const COMPOSER_MODEL_ID = "claude-haiku-4-5-20251001";

export async function composeDigest(
  input: ComposerInput
): Promise<ComposerOutput> {
  const systemPrompt = buildComposerSystemPrompt(input);

  const result = await generateText({
    model: anthropic(COMPOSER_MODEL_ID),
    system: systemPrompt,
    prompt:
      "Compose the brief now. Emit ONE JSON object matching the contract. No preamble, no fences, no commentary.",
    temperature: 0.3,
    maxTokens: 2400,
  });

  const brief = parseAndValidateBrief(result.text);
  const markdown = renderBriefMarkdown(brief);

  const inputTokens = result.usage?.promptTokens ?? 0;
  const outputTokens = result.usage?.completionTokens ?? 0;
  const costUsd = anthropicCostUsd(COMPOSER_MODEL_ID, inputTokens, outputTokens);

  await recordCost({
    userId: input.userId ?? null,
    digestRunId: input.digestRunId ?? null,
    kind: "llm_call",
    provider: "anthropic",
    model: COMPOSER_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
  });

  return {
    markdown,
    modelId: COMPOSER_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

/**
 * Exported for tests and offline tooling (sample-brief generator).
 * Validates shape AND citation parity. Throws ComposerJsonError on failure.
 */
export function parseAndValidateBrief(raw: string): BriefJson {
  const parsed = extractJsonObject(raw);
  const result = briefJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new ComposerJsonError(
      `brief JSON schema validation failed: ${result.error.message}`
    );
  }
  const brief = result.data;
  const parity = checkCitationParity(brief);
  if (!parity.ok) {
    const bits: string[] = [];
    if (parity.missingSources.length > 0) {
      bits.push(`missing sources for markers [${parity.missingSources.join(",")}]`);
    }
    if (parity.unusedSources.length > 0) {
      bits.push(`unused sources for markers [${parity.unusedSources.join(",")}]`);
    }
    throw new ComposerJsonError(`citation parity failed: ${bits.join("; ")}`);
  }
  return brief;
}

export { COMPOSER_MODEL_ID };
