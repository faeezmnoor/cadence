/**
 * T-512a: cost-to-us estimation unit checks.
 *
 * Live SUM-from-Postgres path is exercised by integration tests in
 * T-505a (per-brief debit). Here we lock the pure conversion + fallback
 * semantics so a refactor can't accidentally start under-counting.
 */
import { describe, expect, it } from "vitest";
import {
  FALLBACK_COST_MICRO,
  USD_TO_MICRO,
  usdToMicroUsd,
} from "@/server/billing/cost";
import { COST_TO_US_MICRO_PER_CREDIT_V1 } from "@/server/billing/packs";

describe("T-512a — cost-to-us conversion", () => {
  it("USD → micro-USD scales by 1e6", () => {
    expect(USD_TO_MICRO).toBe(1_000_000);
    expect(usdToMicroUsd(1)).toBe(1_000_000);
    expect(usdToMicroUsd(0.005)).toBe(5000);
    expect(usdToMicroUsd(0.0123)).toBe(12_300);
  });

  it("rounds to the nearest micro-USD", () => {
    // 0.0000005 USD = 0.5 micro-USD → rounds to 1.
    expect(usdToMicroUsd(0.0000005)).toBe(1);
    // 0.00000049 USD = 0.49 micro-USD → rounds to 0.
    expect(usdToMicroUsd(0.00000049)).toBe(0);
  });

  it("returns 0 on non-positive or NaN", () => {
    expect(usdToMicroUsd(0)).toBe(0);
    expect(usdToMicroUsd(-1)).toBe(0);
    expect(usdToMicroUsd(Number.NaN)).toBe(0);
    expect(usdToMicroUsd(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("fallback floor matches the COGS estimate in the pack ladder", () => {
    // Drift between these two = drift between dashboards and real margins.
    expect(FALLBACK_COST_MICRO).toBe(COST_TO_US_MICRO_PER_CREDIT_V1);
  });
});
