/**
 * Provider selection (CAD-85 / T-520).
 *
 * Single entry point: `getProviders(tier)` returns the (search, composer)
 * pair for the requested tier. Both arms exist in the codebase from the
 * Phase 5.1 foundation work, but the Pro arm is GATED behind
 * `pro_tier_alpha` env flag — `getProviders("pro")` falls back to the
 * default bundle in production until the flag flips.
 *
 * This is the ONLY place where tier → provider routing lives. Add new
 * tiers here, not at call sites.
 */
import { defaultComposerProvider, defaultSearchProvider } from "./default";
import { proComposerProvider } from "./anthropic-pro";
import { proSearchProvider } from "./perplexity";
import type { ProviderBundle, Tier } from "./types";

/**
 * Is the Pro tier alpha flag set? When false, `getProviders("pro")`
 * returns the default bundle. Keep this check cheap (env read) so it
 * can be called inside hot paths.
 */
export function isProTierAlphaEnabled(): boolean {
  return process.env.PRO_TIER_ALPHA === "1" || process.env.PRO_TIER_ALPHA === "true";
}

export function getProviders(tier: Tier): ProviderBundle {
  if (tier === "pro" && isProTierAlphaEnabled()) {
    return {
      tier: "pro",
      search: proSearchProvider,
      composer: proComposerProvider,
    };
  }
  // Default fallback — including "pro" requests when the alpha flag is
  // off. Callers can detect this via the returned `tier` field.
  return {
    tier: "default",
    search: defaultSearchProvider,
    composer: defaultComposerProvider,
  };
}

export * from "./types";
