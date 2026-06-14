/**
 * CAD-224 #1 / CAD-225 (CTO audit #3) — refundForFailedRun amount precedence.
 *
 * Pure-unit coverage of the precedence ladder, extracted into
 * resolveRefundAmount so it can be tested without a live Postgres:
 *   mirror-charge > metadata.tier.resolved > metadata.tier.requested >
 *   spec.tier > "default".
 *
 * The load-bearing case: a pro_websearch spec downgraded to default for
 * insufficient credits must refund what the run RESOLVED to (1), not what was
 * requested (5) — and a real charge row beats all tier inference.
 */
import { describe, it, expect } from "vitest";
import { resolveRefundAmount } from "@/server/billing/refund";

describe("CAD-225 — resolveRefundAmount precedence", () => {
  it("mirror-charge wins outright (refund exactly what we took)", () => {
    // Even though metadata says pro_websearch (5), a real $3 charge refunds 3.
    const r = resolveRefundAmount({
      chargeAmount: 3,
      tierMeta: { requested: "pro_websearch", resolved: "pro_websearch" },
      specTier: "pro_websearch",
    });
    expect(r.amount).toBe(3);
    expect(r.source).toBe("mirror_charge");
  });

  it("no charge → metadata.resolved beats requested (downgrade case)", () => {
    // pro_websearch requested but downgraded to default → refund 1, not 5.
    const r = resolveRefundAmount({
      chargeAmount: 0,
      tierMeta: { requested: "pro_websearch", resolved: "default" },
      specTier: "pro_websearch",
    });
    expect(r.amount).toBe(1);
    expect(r.source).toBe("run_metadata_tier");
    expect(r.tier).toBe("default");
  });

  it("no charge, no resolved → falls to metadata.requested", () => {
    const r = resolveRefundAmount({
      chargeAmount: 0,
      tierMeta: { requested: "pro_websearch" },
      specTier: "default",
    });
    expect(r.amount).toBe(5);
    expect(r.source).toBe("run_metadata_tier");
    expect(r.tier).toBe("pro_websearch");
  });

  it("no charge, no tier metadata → falls to spec.tier", () => {
    const r = resolveRefundAmount({
      chargeAmount: 0,
      tierMeta: null,
      specTier: "pro_websearch",
    });
    expect(r.amount).toBe(5);
    expect(r.source).toBe("spec_tier");
    expect(r.tier).toBe("pro_websearch");
  });

  it("nothing known → default (refund 1)", () => {
    const r = resolveRefundAmount({
      chargeAmount: 0,
      tierMeta: null,
      specTier: null,
    });
    expect(r.amount).toBe(1);
    expect(r.source).toBe("spec_tier");
    expect(r.tier).toBe("default");
  });

  it("CAD-225 backward-compat: a legacy spec.tier='pro' still refunds 3 via spec_tier", () => {
    // creditCostForTier keeps the retired 'pro' price at 3 for legacy rows,
    // so a refund inferred from a stale 'pro' spec mirrors the historical
    // charge rather than under-refunding at 1.
    const r = resolveRefundAmount({
      chargeAmount: 0,
      tierMeta: null,
      specTier: "pro",
    });
    expect(r.amount).toBe(3);
    expect(r.source).toBe("spec_tier");
    expect(r.tier).toBe("pro");
  });
});
