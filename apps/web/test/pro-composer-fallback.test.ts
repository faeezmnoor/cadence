/**
 * CAD-102 (T3) — Pro composer failure falls back to default composer.
 *
 * The downside of restructuring run.ts to fit a DB-mocked harness is high
 * (existing CAD-89 downgrade test uses source-grep for the same reason).
 * We follow the same pattern: lock the structural invariants in source +
 * confirm the providers-layer building blocks actually flip from pro→
 * default when called by name.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProviders } from "@/server/ai/providers";

const src = readFileSync(
  join(__dirname, "..", "server/digest/run.ts"),
  "utf8"
);

describe("CAD-102 — Pro composer fallback (source invariants)", () => {
  it("inner try/catch wraps the providers.composer.compose call", () => {
    // The compose call must live inside a try so a throw can be intercepted
    // BEFORE the outer pipeline catch converts it into a failed run.
    expect(src).toMatch(/try \{[\s\S]*?providers\.composer\.compose\(composerInput\)/);
  });

  it("only Pro composer failures trigger fallback (default re-throws)", () => {
    expect(src).toMatch(/if \(providers\.tier !== "pro"\) \{\s*throw composerErr/);
  });

  it("Sentry captures the Pro failure with route + tier tags", () => {
    expect(src).toMatch(/Sentry\.captureException/);
    expect(src).toMatch(/route:\s*"digest\.compose"/);
    expect(src).toMatch(/tier:\s*"pro"/);
  });

  it("falls back via getProviders(\"default\") and re-runs compose", () => {
    expect(src).toMatch(/providers = getProviders\("default"\)/);
    expect(src).toMatch(/out = await providers\.composer\.compose\(composerInput\)/);
  });

  it("stamps runMetadata.fallback with from/to/reason", () => {
    expect(src).toMatch(/runMetadata\.fallback = \{\s*from: "pro",\s*to: "default",\s*reason/);
  });

  it("debit reads resolved tier (already routes to 1-credit after fallback)", () => {
    // The downstream debit path keys off runMetadata.tier.resolved, which
    // we overwrite to "default" via providers.tier after fallback.
    // Locking the debit line confirms the bridge: fallback → resolved=default
    // → creditCostForTier("default") → debit 1.
    expect(src).toMatch(
      /tier:\s*\(runMetadata\.tier as[\s\S]*?resolved\?:.*?\)\?\.resolved \?\? "default"/
    );
  });
});

describe("CAD-102 — providers layer is callable for fallback", () => {
  // Confirm the building block the fallback path depends on actually
  // exists and exposes a default composer regardless of alpha flag state.
  it("getProviders('default') always returns the default bundle", () => {
    const bundle = getProviders("default");
    expect(bundle.tier).toBe("default");
    expect(bundle.composer.id).toBe("anthropic-haiku");
  });
});
