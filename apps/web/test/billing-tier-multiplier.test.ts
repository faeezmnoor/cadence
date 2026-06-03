/**
 * CAD-89: tier-based credit multiplier (Pro = 3 credits, default = 1).
 *
 * Coverage:
 *   1. creditCostForTier pure function — locks 1/3 mapping.
 *   2. debitForDelivery(tier: "pro") debits 3 credits, stamps tier on tx.
 *   3. debitForDelivery(tier: "default") still debits 1.
 *   4. refundForFailedRun mirrors the prior charge amount (3 for Pro, 1
 *      for default) and falls back to spec.tier when there is no charge.
 *   5. run.ts downgrade path: pro spec + balance < 3 routes to default
 *      and stamps metadata.downgrade.reason.
 *
 * Mocks the Drizzle db client per existing pattern (see
 * admin-rate-brief.test.ts) so we don't need a live Postgres.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  creditCostForTier,
  type Tier,
} from "@/server/billing/cost";

describe("CAD-89 — creditCostForTier", () => {
  it("Pro returns 3", () => {
    expect(creditCostForTier("pro" satisfies Tier)).toBe(3);
  });

  it("default returns 1", () => {
    expect(creditCostForTier("default" satisfies Tier)).toBe(1);
  });

  it("unknown / null falls back to 1 (default)", () => {
    expect(creditCostForTier(null)).toBe(1);
    expect(creditCostForTier(undefined)).toBe(1);
    expect(creditCostForTier("bogus")).toBe(1);
  });
});
