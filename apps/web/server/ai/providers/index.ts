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
import { webSearchComposerProvider } from "./anthropic-websearch";
import { isProTierAlpha } from "@/lib/feature-flags";
import type {
  ComposerProvider,
  ProviderBundle,
  SearchProvider,
  Tier,
} from "./types";

/**
 * Is the Pro tier alpha flag set? When false, `getProviders("pro")`
 * returns the default bundle. Keep this check cheap (env read) so it
 * can be called inside hot paths.
 *
 * CAD-101: delegates to the canonical `isProTierAlpha()` helper in
 * `@/lib/feature-flags`. The legacy name is preserved so existing
 * call sites (digest/run.ts, /spec page, tests) don't churn.
 */
export function isProTierAlphaEnabled(): boolean {
  return isProTierAlpha();
}

export function getProviders(tier: Tier): ProviderBundle {
  if (tier === "pro" && isProTierAlphaEnabled()) {
    return {
      tier: "pro",
      search: proSearchProvider,
      composer: proComposerProvider,
    };
  }
  // CAD-222 (founder ruling 2026-06-11): bake-off winner promoted to a
  // selectable stack. No separate search step — the composer researches
  // inline via the Anthropic web-search server tool; the bundle's
  // `search` is the default (Brave) provider, which the pipeline already
  // runs for every tier in its sources step.
  if (tier === "pro_websearch" && isProTierAlphaEnabled()) {
    return {
      tier: "pro_websearch",
      search: defaultSearchProvider,
      composer: webSearchComposerProvider,
    };
  }
  // Default fallback — including advanced requests when the alpha flag
  // is off. Callers can detect this via the returned `tier` field.
  return {
    tier: "default",
    search: defaultSearchProvider,
    composer: defaultComposerProvider,
  };
}

// ---------------------------------------------------------------------------
// CAD-222 — Pro integrity bake-off stacks
// ---------------------------------------------------------------------------

/**
 * The two research stacks competing for the (product-paused) advanced
 * tier. Deliberately NOT part of the user-facing `Tier` union and NOT
 * routed by `getProviders()` — `PRO_TIER_ALPHA` semantics are unchanged.
 * Consumers: the bake-off runner (`scripts/pro-bakeoff.ts`) and the
 * tier-aware call site the pipeline owner is wiring in
 * `server/digest/run.ts`. The losing contender gets DELETED after the
 * bake-off; keep this seam thin.
 */
export type BakeoffContender = "perplexity_sonnet" | "sonnet_websearch";

export interface BakeoffStack {
  contender: BakeoffContender;
  /**
   * Absent for `sonnet_websearch` — that contender researches inline via
   * the Anthropic web-search server tool, so there is no separate search
   * step. Callers must treat `search` as optional, not default it.
   */
  search?: SearchProvider;
  composer: ComposerProvider;
}

export function getBakeoffStack(contender: BakeoffContender): BakeoffStack {
  switch (contender) {
    case "perplexity_sonnet":
      // A2: Perplexity Sonar search (synthesis kept as researchMemo) +
      // Pro Sonnet composer.
      return {
        contender,
        search: proSearchProvider,
        composer: proComposerProvider,
      };
    case "sonnet_websearch":
      // A3: Pro Sonnet composer with the native web-search server tool.
      return { contender, composer: webSearchComposerProvider };
  }
}

export * from "./types";
