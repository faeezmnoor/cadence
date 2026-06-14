/**
 * CAD-90 / CAD-225: pro-tier eval gate readiness helper.
 *
 * We mock `db.execute` to return fixture aggregate rows (the helper does the
 * group-by in SQL, so we feed back already-grouped rows). Coverage of the
 * CAD-225 criterion (grounding is NO LONGER a hard bar):
 *   - no_data when neither tier has samples
 *   - insufficient_pro / insufficient_default on sample shortfall
 *   - lead_below_threshold when composite lead < MIN_LEAD (0.25)
 *   - specificity_below_threshold when the lead clears but advanced
 *     specificity < MIN_ADVANCED_SPECIFICITY (3.7)  ← composite-passing but
 *     specificity-failing does NOT pass
 *   - ready when lead >= 0.25 AND advanced specificity >= 3.7
 *   - a grounding-floored topic (low grounding both tiers) still readies as
 *     long as specificity + the lead clear — proving grounding isn't gated.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MIN_LEAD,
  MIN_ADVANCED_SPECIFICITY,
} from "@/server/evals/pro-eval-gate";

type AggRow = {
  tier: string;
  n: string | number;
  avg_g: string | number | null;
  avg_s: string | number | null;
  avg_f: string | number | null;
};

let nextRows: AggRow[] = [];

vi.mock("@/server/db/client", () => {
  return {
    db: {
      execute: vi.fn(async () => nextRows),
    },
  };
});

import { proTierAlphaReady } from "@/server/evals/pro-eval-gate";

beforeEach(() => {
  nextRows = [];
});

function row(
  tier: "pro_websearch" | "default",
  n: number,
  g: number,
  s: number,
  f: number
): AggRow {
  return { tier, n, avg_g: g, avg_s: s, avg_f: f };
}

describe("CAD-225 — gate constants", () => {
  it("MIN_LEAD is lowered to 0.25", () => {
    expect(MIN_LEAD).toBe(0.25);
  });
  it("MIN_ADVANCED_SPECIFICITY bar is 3.7", () => {
    expect(MIN_ADVANCED_SPECIFICITY).toBe(3.7);
  });
});

describe("proTierAlphaReady", () => {
  it("returns no_data when no rated runs exist", async () => {
    nextRows = [];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("no_data");
    expect(res.metrics.proCount).toBe(0);
    expect(res.metrics.defaultCount).toBe(0);
    expect(res.metrics.lead).toBeNull();
  });

  it("returns insufficient_default when Pro=5 but Default=4", async () => {
    nextRows = [
      row("pro_websearch", 5, 4.2, 4.0, 4.4),
      row("default", 4, 3.5, 3.6, 3.5),
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("insufficient_default");
    expect(res.metrics.proCount).toBe(5);
    expect(res.metrics.defaultCount).toBe(4);
  });

  it("returns insufficient_pro when Default=5 but Pro=2", async () => {
    nextRows = [
      row("pro_websearch", 2, 4.5, 4.5, 4.5),
      row("default", 5, 3.5, 3.5, 3.5),
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("insufficient_pro");
  });

  it("returns lead_below_threshold when composite lead < 0.25", async () => {
    // Advanced composite = 3.9, Default composite = 3.8, lead = 0.1 < 0.25.
    // Advanced specificity (3.9) clears its bar, so the FAILURE is the lead.
    nextRows = [
      row("pro_websearch", 5, 3.9, 3.9, 3.9),
      row("default", 5, 3.8, 3.8, 3.8),
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("lead_below_threshold");
    expect(res.metrics.lead).toBeCloseTo(0.1, 3);
  });

  it("specificity-FAILING but composite-PASSING advanced does NOT pass", async () => {
    // CAD-225 core: advanced wins composite on grounding+fit (lead 0.4 >=
    // 0.25) but its specificity (3.5) is below the 3.7 bar — the axis where
    // advanced MUST measurably win. Gate must reject.
    nextRows = [
      // g=4.3, s=3.5, f=4.3 → composite 4.033
      row("pro_websearch", 6, 4.3, 3.5, 4.3),
      // composite 3.633
      row("default", 5, 3.6, 3.7, 3.6),
    ];
    const res = await proTierAlphaReady();
    expect(res.metrics.lead).toBeGreaterThanOrEqual(MIN_LEAD);
    expect(res.metrics.proAxes?.specificity).toBeLessThan(
      MIN_ADVANCED_SPECIFICITY
    );
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("specificity_below_threshold");
  });

  it("specificity-PASSING and composite-PASSING advanced DOES pass (vice versa)", async () => {
    // Mirror of the case above: advanced specificity 3.9 (>= 3.7) and a
    // composite lead of 0.3 (>= 0.25). Ready.
    nextRows = [
      // g=3.9, s=3.9, f=3.9 → composite 3.9
      row("pro_websearch", 6, 3.9, 3.9, 3.9),
      // composite 3.6 → lead 0.3
      row("default", 5, 3.6, 3.6, 3.6),
    ];
    const res = await proTierAlphaReady();
    expect(res.metrics.lead).toBeCloseTo(0.3, 3);
    expect(res.metrics.proAxes?.specificity).toBeGreaterThanOrEqual(
      MIN_ADVANCED_SPECIFICITY
    );
    expect(res.ready).toBe(true);
    expect(res.reason).toBe("ready");
  });

  it("grounding is NOT gated: a grounding-floored topic still readies", async () => {
    // CAD-225 finding: grounding ~2.3 is the judge's FLOOR on niche topics —
    // BOTH tiers ground low (2.3 / 2.4). Advanced wins on specificity (4.2)
    // and fit (4.0); composite lead 0.5 >= 0.25 and specificity 4.2 >= 3.7.
    // A grounding hard-bar would have wrongly blocked this — the gate readies.
    nextRows = [
      // g=2.3, s=4.2, f=4.0 → composite 3.5
      row("pro_websearch", 6, 2.3, 4.2, 4.0),
      // g=2.4, s=3.3, f=3.3 → composite 3.0 → lead 0.5
      row("default", 5, 2.4, 3.3, 3.3),
    ];
    const res = await proTierAlphaReady();
    expect(res.metrics.proAxes?.grounding).toBeLessThan(3); // floored
    expect(res.metrics.lead).toBeCloseTo(0.5, 3);
    expect(res.ready).toBe(true);
    expect(res.reason).toBe("ready");
  });

  it("handles numeric strings from pg driver (drizzle returns numeric as string)", async () => {
    nextRows = [
      { tier: "pro_websearch", n: "5", avg_g: "4.0", avg_s: "4.0", avg_f: "4.0" },
      { tier: "default", n: "5", avg_g: "3.0", avg_s: "3.0", avg_f: "3.0" },
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(true);
    expect(res.metrics.lead).toBeCloseTo(1.0, 3);
  });
});

describe("CAD-225 CTO-P1 — gate buckets advanced by isAdvancedStack, not the retired \"pro\" string", () => {
  it("rates the live advanced stack (pro_websearch), not a column 0028 erased", async () => {
    nextRows = [
      row("pro_websearch", 5, 2.3, 4.0, 4.0), // grounding-floored but specific
      row("default", 5, 2.4, 3.2, 3.3),
    ];
    const out = await proTierAlphaReady();
    // Advanced arm is populated from pro_websearch, composite lead clears
    // 0.25 and specificity clears 3.7 -> ready.
    expect(out.metrics.proCount).toBe(5);
    expect(out.ready).toBe(true);
  });

  it("a legacy 'pro' row counts toward the BASELINE arm (normalizeStack pro->default)", async () => {
    nextRows = [
      row("default", 3, 3.0, 3.0, 3.0),
      { tier: "pro", n: "2", avg_g: "2.0", avg_s: "3.4", avg_f: "3.3" },
    ];
    const out = await proTierAlphaReady();
    // No advanced ratings at all -> defaultCount aggregates both, proCount 0.
    expect(out.metrics.proCount).toBe(0);
    expect(out.metrics.defaultCount).toBe(5);
  });
});

