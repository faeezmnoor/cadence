/**
 * CAD-225 (CTO audit #2) — the Pro cost-overrun circuit breaker meters BOTH
 * advanced stacks.
 *
 * The breaker sums today's cost_events attributed to advanced runs and trips
 * over a daily USD cap. The bug it guards against (review P1-3): if the
 * predicate metered only 'pro', the MORE expensive 'pro_websearch' stack
 * could run away without ever tripping the breaker. The predicate must be the
 * two-tier `IN ('pro', 'pro_websearch')`.
 *
 * Two layers:
 *   1. Pure boundary semantics via evaluateProCostSanity (> cap trips,
 *      == cap does NOT, < cap passes).
 *   2. Source-pin the two-tier jsonb predicate in isProTierCostSane so a
 *      drive-by edit can't silently drop pro_websearch from the meter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateProCostSanity,
  DEFAULT_PRO_DAILY_USD_CAP,
} from "@/server/billing/circuit-breaker";

const src = readFileSync(
  join(__dirname, "..", "server/billing/circuit-breaker.ts"),
  "utf8"
);

describe("CAD-225 — circuit breaker meters pro AND pro_websearch", () => {
  it("isProTierCostSane filters on a two-tier IN ('pro','pro_websearch') predicate", () => {
    // The exact jsonb path + both tier values must be present, or the most
    // expensive stack escapes the cap.
    expect(src).toMatch(/#>>\s*'\{tier,resolved\}'\s+IN\s*\('pro',\s*'pro_websearch'\)/);
  });

  it("does NOT meter on a single-tier predicate (regression guard)", () => {
    // A `= 'pro'` (single value) would miss pro_websearch — assert it's gone.
    expect(src).not.toMatch(/#>>\s*'\{tier,resolved\}'\s*=\s*'pro'/);
  });
});

describe("CAD-102 — evaluateProCostSanity boundary semantics", () => {
  it("under the cap passes", () => {
    const res = evaluateProCostSanity(DEFAULT_PRO_DAILY_USD_CAP - 0.01);
    expect(res.ok).toBe(true);
  });

  it("exactly at the cap does NOT trip (strict >)", () => {
    const res = evaluateProCostSanity(DEFAULT_PRO_DAILY_USD_CAP);
    expect(res.ok).toBe(true);
  });

  it("over the cap trips with a reason", () => {
    const res = evaluateProCostSanity(DEFAULT_PRO_DAILY_USD_CAP + 0.01);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/pro_tier_daily_cap_exceeded/);
  });

  it("honors a custom cap argument", () => {
    expect(evaluateProCostSanity(5, 10).ok).toBe(true);
    expect(evaluateProCostSanity(11, 10).ok).toBe(false);
  });
});
