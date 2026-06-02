/**
 * Weekly distill LLM call (T-405 / CAD-46).
 *
 * Same provider/model as the composer (Claude Haiku 4.5). Cheap, fast,
 * deterministic enough at temperature 0.1. The prompt is short and
 * stable so cost stays in the low millicents per user per week.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { anthropicCostUsd, recordCost } from "@/server/cost/record";
import {
  buildDistillSystemPrompt,
  buildDistillUserPrompt,
  parseDistillOutput,
  type DistillSignal,
} from "./prompt";

// Match composer model id so a single pricing/provider entry covers
// both. If we ever swap to a cheaper distill model, do it here only.
export const DISTILL_MODEL_ID = "claude-haiku-4-5-20251001";

export interface DistillCallArgs {
  userId: string;
  priorPrefs: string[];
  signals: DistillSignal[];
}

export interface DistillCallResult {
  bullets: string[];
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function distillPrefs(args: DistillCallArgs): Promise<DistillCallResult> {
  const system = buildDistillSystemPrompt();
  const prompt = buildDistillUserPrompt({
    priorPrefs: args.priorPrefs,
    signals: args.signals,
  });

  const result = await generateText({
    model: anthropic(DISTILL_MODEL_ID),
    system,
    prompt,
    // Low temp — we want stability week-over-week. Distill is a fold,
    // not a creative rewrite.
    temperature: 0.1,
    // Output is a small JSON array; 600 tokens is generous.
    maxTokens: 600,
  });

  const inputTokens = result.usage?.promptTokens ?? 0;
  const outputTokens = result.usage?.completionTokens ?? 0;
  const costUsd = anthropicCostUsd(DISTILL_MODEL_ID, inputTokens, outputTokens);

  await recordCost({
    userId: args.userId,
    digestRunId: null,
    kind: "llm_call",
    provider: "anthropic",
    model: DISTILL_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
  });

  const bullets = parseDistillOutput(result.text);

  return {
    bullets,
    modelId: DISTILL_MODEL_ID,
    inputTokens,
    outputTokens,
    costUsd,
  };
}
