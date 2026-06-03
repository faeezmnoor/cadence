/**
 * CAD-85 / T-520 — Provider abstraction layer.
 *
 * Validates the routing rules in `getProviders` without depending on
 * any live network or DB. Behavior under test:
 *   - Default tier always returns Brave + Haiku.
 *   - "pro" tier with alpha flag OFF falls back to default.
 *   - "pro" tier with alpha flag ON returns Perplexity + Sonnet.
 *   - Adapters expose stable ids that downstream cost logs can rely on.
 */
import { describe, it, expect } from "vitest";
import {
  getProviders,
  isProTierAlphaEnabled,
} from "@/server/ai/providers";
import {
  defaultComposerProvider,
  defaultSearchProvider,
} from "@/server/ai/providers/default";
import { COMPOSER_MODEL_ID } from "@/server/ai/composer/compose";
import { PRO_COMPOSER_MODEL_ID } from "@/server/ai/providers/anthropic-pro";

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

describe("CAD-85 provider abstraction", () => {
  it("default tier returns Brave + Haiku adapters", () => {
    const bundle = getProviders("default");
    expect(bundle.tier).toBe("default");
    expect(bundle.search.id).toBe("brave");
    expect(bundle.composer.id).toBe("anthropic-haiku");
    expect(bundle.composer.modelId).toBe(COMPOSER_MODEL_ID);
  });

  it("default exports point at the same adapter instances", () => {
    const bundle = getProviders("default");
    expect(bundle.search).toBe(defaultSearchProvider);
    expect(bundle.composer).toBe(defaultComposerProvider);
  });

  it("pro tier with alpha flag OFF falls back to default", () => {
    withEnv("PRO_TIER_ALPHA", undefined, () => {
      const bundle = getProviders("pro");
      expect(bundle.tier).toBe("default");
      expect(bundle.search.id).toBe("brave");
    });
  });

  it("pro tier with alpha flag '1' returns Pro providers", () => {
    withEnv("PRO_TIER_ALPHA", "1", () => {
      const bundle = getProviders("pro");
      expect(bundle.tier).toBe("pro");
      expect(bundle.search.id).toBe("perplexity-sonar-reasoning-pro");
      expect(bundle.composer.id).toBe("anthropic-sonnet-pro");
      expect(bundle.composer.modelId).toBe(PRO_COMPOSER_MODEL_ID);
    });
  });

  it("pro tier with alpha flag 'true' also opts in", () => {
    withEnv("PRO_TIER_ALPHA", "true", () => {
      expect(isProTierAlphaEnabled()).toBe(true);
      expect(getProviders("pro").tier).toBe("pro");
    });
  });

  it("pro tier with alpha flag 'false' falls back", () => {
    withEnv("PRO_TIER_ALPHA", "false", () => {
      expect(isProTierAlphaEnabled()).toBe(false);
      expect(getProviders("pro").tier).toBe("default");
    });
  });
});
