/**
 * CAD-87 / T-522 — Sonnet 4.6 Pro composer + Pro prompt template.
 *
 * Pure tests on the prompt builder. We do NOT exercise the live
 * Anthropic call (would cost money + need network). The composer
 * function shape is covered by `providers-abstraction.test.ts` via
 * `getProviders("pro")` and the existing composer-schema tests cover
 * the JSON validation path that both default and Pro share.
 */
import { describe, it, expect } from "vitest";
import {
  PRO_PROMPT_TAG,
  buildProComposerSystemPrompt,
} from "@/server/ai/providers/anthropic-pro-prompt";
import {
  PRO_COMPOSER_MODEL_ID,
  proComposerProvider,
} from "@/server/ai/providers/anthropic-pro";
import type { ComposerInput } from "@/server/ai/composer/types";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";

function input(): ComposerInput {
  return {
    spec: emptyDigestSpec(),
    sources: { search: [], rss: [] },
  };
}

describe("CAD-87 Pro composer prompt", () => {
  it("includes the Pro tag for log scraping", () => {
    const prompt = buildProComposerSystemPrompt(input());
    expect(prompt).toContain(PRO_PROMPT_TAG);
  });

  it("embeds the Pro rigor preamble before the structural contract", () => {
    const prompt = buildProComposerSystemPrompt(input());
    expect(prompt).toMatch(/WHAT MAKES A PRO BRIEF/);
    expect(prompt).toMatch(/Synthesize across sources/);
    expect(prompt).toMatch(/Second-order thinking/);
  });

  it("preserves the OUTPUT CONTRACT section from the default prompt", () => {
    const prompt = buildProComposerSystemPrompt(input());
    expect(prompt).toMatch(/OUTPUT CONTRACT/);
    expect(prompt).toMatch(/schema_version/);
    expect(prompt).toMatch(/feedback_cta/);
  });

  it("Pro preamble appears before the default contract", () => {
    const prompt = buildProComposerSystemPrompt(input());
    const proIdx = prompt.indexOf("WHAT MAKES A PRO BRIEF");
    const contractIdx = prompt.indexOf("OUTPUT CONTRACT");
    expect(proIdx).toBeGreaterThan(-1);
    expect(contractIdx).toBeGreaterThan(proIdx);
  });
});

describe("CAD-87 Pro composer provider shape", () => {
  it("exposes a stable provider id and model id", () => {
    expect(proComposerProvider.id).toBe("anthropic-sonnet-pro");
    expect(proComposerProvider.modelId).toBe(PRO_COMPOSER_MODEL_ID);
    expect(PRO_COMPOSER_MODEL_ID).toMatch(/sonnet/);
  });
});
