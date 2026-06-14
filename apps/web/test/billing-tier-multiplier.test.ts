/**
 * CAD-89 / CAD-222 / CAD-225: tier-based credit multiplier.
 *
 * Coverage in THIS file (a pure-function pin — refund mirroring is covered
 * separately in refund-tier-precedence.test.ts, NOT here; the prior header
 * falsely claimed refund coverage that never lived in this file):
 *   1. creditCostForTier pure function — locks the 1 / 3 / 5 registry mapping,
 *      including the CAD-225 backward-compat fact that a RAW 'pro' string
 *      still costs 3 even though the stack is retired.
 *
 * The debit and run.ts downgrade paths are exercised in billing-debit.test.ts
 * and the digest-pipeline tests respectively.
 */
import { describe, it, expect } from "vitest";

import {
  creditCostForTier,
  type Tier,
} from "@/server/billing/cost";
import { normalizeStack } from "@/lib/research-stack";

describe("CAD-89 / CAD-225 — creditCostForTier", () => {
  it("raw 'pro' string STILL returns 3 (backward-compat for legacy charge rows)", () => {
    // CAD-225 retired the 'pro' stack from the product, but a legacy
    // charge/refund stamped tier='pro' must mirror back exactly 3.
    expect(creditCostForTier("pro" satisfies Tier)).toBe(3);
  });

  it("pro_websearch returns 5", () => {
    expect(creditCostForTier("pro_websearch" satisfies Tier)).toBe(5);
  });

  it("default returns 1", () => {
    expect(creditCostForTier("default" satisfies Tier)).toBe(1);
  });

  it("unknown / null falls back to 1 (default)", () => {
    expect(creditCostForTier(null)).toBe(1);
    expect(creditCostForTier(undefined)).toBe(1);
    expect(creditCostForTier("bogus")).toBe(1);
  });

  it("a SPEC never bills 3: normalizeStack('pro') → 'default' so a live brief costs 1, not 3", () => {
    // The two facts together: the raw price lookup keeps 3 for legacy rows,
    // but a spec's tier is normalized BEFORE it bills, so creditCostForTier
    // applied to the normalized value yields 1. No live brief charges 3.
    expect(creditCostForTier("pro")).toBe(3);
    expect(normalizeStack("pro")).toBe("default");
    expect(creditCostForTier(normalizeStack("pro"))).toBe(1);
  });
});
