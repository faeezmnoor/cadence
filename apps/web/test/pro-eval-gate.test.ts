/**
 * CAD-90: pro-tier eval gate readiness helper.
 *
 * We mock `db.execute` to return fixture aggregate rows (the helper does the
 * group-by in SQL, so we feed back already-grouped rows). Coverage:
 *   - no_data when neither tier has samples
 *   - insufficient_default when Pro has enough but Default doesn't
 *   - lead_below_threshold when both have enough samples but Pro doesn't lead by 0.5
 *   - ready when both have >=5 samples and the lead is >= 0.5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  tier: "pro" | "default",
  n: number,
  g: number,
  s: number,
  f: number
): AggRow {
  return { tier, n, avg_g: g, avg_s: s, avg_f: f };
}

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
      row("pro", 5, 4.2, 4.0, 4.4),
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
      row("pro", 2, 4.5, 4.5, 4.5),
      row("default", 5, 3.5, 3.5, 3.5),
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("insufficient_pro");
  });

  it("returns lead_below_threshold when both have 5+ but lead < 0.5", async () => {
    // Pro composite = 3.8, Default composite = 3.5, lead = 0.3
    nextRows = [
      row("pro", 5, 3.8, 3.8, 3.8),
      row("default", 5, 3.5, 3.5, 3.5),
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(false);
    expect(res.reason).toBe("lead_below_threshold");
    expect(res.metrics.proCompositeAvg).toBeCloseTo(3.8, 3);
    expect(res.metrics.defaultCompositeAvg).toBeCloseTo(3.5, 3);
    expect(res.metrics.lead).toBeCloseTo(0.3, 3);
  });

  it("returns ready when both >=5 and lead >= 0.5", async () => {
    // Pro composite = 4.1, Default composite = 3.5, lead = 0.6
    nextRows = [
      row("pro", 6, 4.1, 4.1, 4.1),
      row("default", 5, 3.5, 3.5, 3.5),
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(true);
    expect(res.reason).toBe("ready");
    expect(res.metrics.lead).toBeCloseTo(0.6, 3);
    expect(res.metrics.proAxes).toEqual({
      grounding: 4.1,
      specificity: 4.1,
      fit: 4.1,
    });
    expect(res.metrics.defaultAxes).toEqual({
      grounding: 3.5,
      specificity: 3.5,
      fit: 3.5,
    });
  });

  it("handles numeric strings from pg driver (drizzle returns numeric as string)", async () => {
    nextRows = [
      { tier: "pro", n: "5", avg_g: "4.0", avg_s: "4.0", avg_f: "4.0" },
      { tier: "default", n: "5", avg_g: "3.0", avg_s: "3.0", avg_f: "3.0" },
    ];
    const res = await proTierAlphaReady();
    expect(res.ready).toBe(true);
    expect(res.metrics.lead).toBeCloseTo(1.0, 3);
  });
});
