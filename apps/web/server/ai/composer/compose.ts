/**
 * Composer entry point (T-208, CAD-31).
 *
 * Calls Claude Haiku 4.5 with the assembled prompt; logs cost; returns
 * the markdown brief.
 *
 * Model id: `claude-haiku-4-5-20251001` (per PHASE2-STATE defaulted decisions).
 *
 * This is NOT where Telegram delivery happens — T-211 (digest.run handler)
 * wires this output into T-209 splitter and the send step.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { anthropicCostUsd, recordCost } from "@/server/cost/record";
import { buildComposerSystemPrompt } from "./prompt";
import type { ComposerInput, ComposerOutput } from "./types";

const COMPOSER_MODEL_ID = "claude-haiku-4-5-20251001";

export async function composeDigest(
  input: ComposerInput
): Promise<ComposerOutput> {
  const systemPrompt = buildComposerSystemPrompt(input);

  const result = await generateText({
    model: anthropic(COMPOSER_MODEL_ID),
    system: systemPrompt,
    // The user-facing "ask" — Haiku writes the brief from sources we
    // already collected. No tool calls.
    prompt:
      "Compose the brief now. Markdown only, no preamble. " +
      "Keep it under 3800 characters total.",
    temperature: 0.3,
    // Hard cap. Haiku is cheap, but a runaway response would blow the
    // Telegram length budget anyway.
    maxTokens: 2000,
  });

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
    markdown: result.text,
    modelId: COMPOSER_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

export { COMPOSER_MODEL_ID };
