/**
 * CAD-85 / T-520 — Provider abstraction layer.
 *
 * Validates the routing rules in `getProviders` without depending on
 * any live network or DB. Behavior under test:
 *   - Default tier always returns Brave + Haiku.
 *   - "pro" tier ALWAYS returns the default bundle now — CAD-225 retired the
 *     Perplexity Sonar (A2) stack from the product; getProviders stays
 *     defensive so a stray raw "pro" never spends Sonar money, regardless of
 *     the alpha flag.
 *   - "pro_websearch" remains the single advanced stack, alpha-gated.
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

  it("pro tier (retired) returns default with alpha flag OFF", () => {
    withEnv("PRO_TIER_ALPHA", undefined, () => {
      const bundle = getProviders("pro");
      expect(bundle.tier).toBe("default");
      expect(bundle.search.id).toBe("brave");
    });
  });

  it("pro tier (retired) returns default EVEN with alpha flag ON (CAD-225)", () => {
    // CAD-225: 'pro' (Perplexity Sonar A2) is retired from the product. The
    // alpha flag no longer resurrects it — getProviders is defensive so a
    // raw 'pro' never routes to the Sonar adapter regardless of the flag.
    withEnv("PRO_TIER_ALPHA", "1", () => {
      const bundle = getProviders("pro");
      expect(bundle.tier).toBe("default");
      expect(bundle.search.id).toBe("brave");
      expect(bundle.composer.id).toBe("anthropic-haiku");
      // Sonar adapters stay in the codebase for the dev bake-off harness but
      // are not reachable via getProviders.
      expect(bundle.search.id).not.toBe("perplexity-sonar-reasoning-pro");
    });
  });

  it("pro tier with alpha flag 'true' STILL returns default (retired)", () => {
    withEnv("PRO_TIER_ALPHA", "true", () => {
      expect(isProTierAlphaEnabled()).toBe(true);
      expect(getProviders("pro").tier).toBe("default");
    });
  });

  // PRO_COMPOSER_MODEL_ID retained as an import so the bake-off harness id
  // stays referenced; assert it's still a non-empty stable string.
  it("PRO_COMPOSER_MODEL_ID remains defined for the dev bake-off harness", () => {
    expect(typeof PRO_COMPOSER_MODEL_ID).toBe("string");
    expect(PRO_COMPOSER_MODEL_ID.length).toBeGreaterThan(0);
  });
});

describe("CAD-222 — pro_websearch stack routing", () => {
  it("alpha flag OFF falls back to default (same gate as pro)", () => {
    withEnv("PRO_TIER_ALPHA", undefined, () => {
      const bundle = getProviders("pro_websearch");
      expect(bundle.tier).toBe("default");
      expect(bundle.composer.id).toBe("anthropic-haiku");
    });
  });

  it("alpha flag ON returns the web-search composer with Brave search", () => {
    withEnv("PRO_TIER_ALPHA", "1", () => {
      const bundle = getProviders("pro_websearch");
      expect(bundle.tier).toBe("pro_websearch");
      // No separate research step — the composer searches inline; the
      // bundle's search slot is the default (Brave) provider the pipeline
      // already runs for every tier.
      expect(bundle.search.id).toBe("brave");
      expect(bundle.composer.id).toBe("anthropic-sonnet-websearch");
    });
  });
});
