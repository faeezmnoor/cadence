/**
 * CAD-203 — research-stack credit math unit tests.
 *
 * Pins the math behind the Configurable Stack Settings preview:
 *   - briefsPerDay() mirrors server briefsPerDayForRule
 *   - nextDeliveryCost(stack) === STACK_COSTS[stack]
 *   - monthlyCreditEstimate(scheduling, stack) === round(perDay * 30 * cost)
 *   - stackLabel() returns no plan-tier nouns
 *
 * Cross-check with briefs-per-day.test.ts (server-side mirror).
 */
import { describe, expect, it } from "vitest";
import {
  STACK_COSTS,
  STACK_DESCRIPTIONS,
  briefsPerDay,
  monthlyCreditEstimate,
  nextDeliveryCost,
  stackLabel,
  STACK_ORDER,
  STACK_SUMMARIES,
  normalizeStack,
  isAdvancedStack,
} from "@/lib/research-stack";

function rule(
  cadence: Record<string, unknown>,
  skipWeekends = false
): Record<string, unknown> {
  return {
    version: 1,
    startDate: "2026-06-10",
    endDate: null,
    timeLocal: "06:30",
    timezone: "Asia/Kuala_Lumpur",
    cadence,
    skipDates: [],
    skipWhen: { weekends: skipWeekends },
  };
}

describe("STACK_COSTS — billing source of truth", () => {
  it("standard costs 1 credit per brief", () => {
    expect(STACK_COSTS.default).toBe(1);
  });
  it("advanced (pro_websearch) costs 5 credits per brief", () => {
    expect(STACK_COSTS.pro_websearch).toBe(5);
  });
  it("retired 'pro' cost stays defined at 3 for backward-compat reads (CAD-225)", () => {
    // The stack is no longer offered, but STACK_COSTS['pro'] must remain so
    // a legacy charge/refund recorded as tier='pro' mirrors back exactly 3.
    expect(STACK_COSTS.pro).toBe(3);
  });
});

describe("briefsPerDay — mirrors server briefsPerDayForRule", () => {
  it("daily 7-day rule → 1 brief/day", () => {
    expect(
      briefsPerDay(rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }))
    ).toBeCloseTo(1);
  });
  it("daily Mon-Fri → 5/7", () => {
    expect(briefsPerDay(rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5] }))).toBeCloseTo(5 / 7);
  });
  it("weekly Mon+Wed → 2/7", () => {
    expect(briefsPerDay(rule({ kind: "weekly", weekdays: [1, 3] }))).toBeCloseTo(2 / 7);
  });
  it("monthly → 1/30", () => {
    expect(briefsPerDay(rule({ kind: "monthly", monthlyDay: 1 }))).toBeCloseTo(1 / 30);
  });
  it("custom_cron → 1/7 conservative", () => {
    expect(
      briefsPerDay(rule({ kind: "custom_cron", cronExpr: "0 6 * * *" }))
    ).toBeCloseTo(1 / 7);
  });
  it("skipWeekends shaves Sat+Sun off daily", () => {
    expect(
      briefsPerDay(rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }, true))
    ).toBeCloseTo(5 / 7);
  });
  it("returns 0 for missing/malformed scheduling (no run-rate yet)", () => {
    expect(briefsPerDay(null)).toBe(0);
    expect(briefsPerDay(undefined)).toBe(0);
    expect(briefsPerDay({})).toBe(0);
    expect(briefsPerDay({ cadence: { kind: "garbage" } })).toBe(0);
  });
});

describe("nextDeliveryCost — single-delivery credit cost", () => {
  it("standard = 1 credit", () => {
    expect(nextDeliveryCost("default")).toBe(1);
  });
  it("advanced (pro_websearch) = 5 credits", () => {
    expect(nextDeliveryCost("pro_websearch")).toBe(5);
  });
});

describe("monthlyCreditEstimate — run-rate preview math", () => {
  it("daily standard ≈ 30 credits/month", () => {
    expect(
      monthlyCreditEstimate(
        rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }),
        "default"
      )
    ).toBe(30);
  });
  it("daily advanced (pro_websearch) ≈ 150 credits/month", () => {
    expect(
      monthlyCreditEstimate(
        rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }),
        "pro_websearch"
      )
    ).toBe(150);
  });
  it("weekly Mon+Wed standard ≈ round(2/7 * 30 * 1) = 9", () => {
    expect(
      monthlyCreditEstimate(rule({ kind: "weekly", weekdays: [1, 3] }), "default")
    ).toBe(9);
  });
  it("monthly advanced ≈ round(1/30 * 30 * 5) = 5", () => {
    expect(
      monthlyCreditEstimate(rule({ kind: "monthly", monthlyDay: 1 }), "pro_websearch")
    ).toBe(5);
  });
  it("returns 0 when scheduling is unknown (preview unavailable copy gate)", () => {
    expect(monthlyCreditEstimate(null, "default")).toBe(0);
    expect(monthlyCreditEstimate({}, "pro_websearch")).toBe(0);
  });
});

describe("stackLabel — no plan-tier nouns per project_cadence_no_tier_plans", () => {
  it("default → 'Standard research'", () => {
    expect(stackLabel("default")).toBe("Standard research");
  });
  it("pro_websearch → 'Advanced research' (CAD-225: the single advanced option, no qualifier)", () => {
    // CAD-225 retired the second advanced stack, so the "· live web search"
    // disambiguator is dropped — it's the only advanced option now.
    expect(stackLabel("pro_websearch")).toBe("Advanced research");
  });
  it("retired 'pro' label is vendor-free 'Advanced research' (unreachable from product)", () => {
    expect(stackLabel("pro")).toBe("Advanced research");
  });
  it("never returns 'Pro plan' / 'Pro tier' / 'Default tier' / 'upgrade'", () => {
    for (const label of [
      stackLabel("default"),
      stackLabel("pro"),
      stackLabel("pro_websearch"),
    ]) {
      expect(label).not.toMatch(/Pro plan|Pro tier|Default tier|upgrade/i);
    }
  });
});

describe("STACK_DESCRIPTIONS — transparency table content", () => {
  it("covers the 6 critical dimensions", () => {
    const labels = STACK_DESCRIPTIONS.map((r) => r.label);
    expect(labels).toContain("Search provider");
    expect(labels).toContain("Composer model");
    expect(labels).toContain("Research depth");
    expect(labels).toContain("Depth of coverage");
    expect(labels).toContain("Typical latency");
    expect(labels).toContain("Credit cost per brief");
  });
  it("each row has all three stack columns populated", () => {
    for (const row of STACK_DESCRIPTIONS) {
      expect(row.default.length).toBeGreaterThan(0);
      expect(row.pro.length).toBeGreaterThan(0);
      expect(row.pro_websearch.length).toBeGreaterThan(0);
    }
  });
  it("no row leaks a plan-tier noun", () => {
    for (const row of STACK_DESCRIPTIONS) {
      expect(
        `${row.default} ${row.pro} ${row.pro_websearch}`
      ).not.toMatch(/Pro plan|Pro tier|Default tier|upgrade to Pro/i);
    }
  });
});

describe("CAD-225 — two-stack registry (pro/A2 retired)", () => {
  it("STACK_ORDER offers only default + pro_websearch, cheapest-first", () => {
    // CAD-225: the dominated 'pro' (Perplexity Sonar A2) stack is retired
    // from the product — it must NOT appear in the iteration order the UI
    // renders from.
    expect(STACK_ORDER).toEqual(["default", "pro_websearch"]);
    expect(STACK_ORDER).not.toContain("pro");
    const costs = STACK_ORDER.map((s) => STACK_COSTS[s]);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it("STACK_COSTS still defines all three (1 / 3 / 5) for backward-compat reads", () => {
    expect(STACK_COSTS.default).toBe(1);
    expect(STACK_COSTS.pro).toBe(3); // retired but still readable
    expect(STACK_COSTS.pro_websearch).toBe(5);
  });

  it("normalizeStack folds retired 'pro' → 'default'; only pro_websearch is advanced", () => {
    // CAD-225 backward-compat ruling: a legacy 'pro' spec falls back to
    // standard (billed 1), NOT auto-upgraded to the 5-credit stack.
    expect(normalizeStack("pro")).toBe("default");
    expect(normalizeStack("pro_websearch")).toBe("pro_websearch");
    expect(normalizeStack("default")).toBe("default");
    expect(normalizeStack("legacy-garbage")).toBe("default");
    expect(normalizeStack(null)).toBe("default");
    expect(normalizeStack(undefined)).toBe("default");
  });

  it("isAdvancedStack: pro_websearch is advanced; default is not", () => {
    expect(isAdvancedStack("default")).toBe(false);
    expect(isAdvancedStack("pro_websearch")).toBe(true);
    // 'pro' still classifies as advanced, but it's unreachable post-normalize.
    expect(isAdvancedStack("pro")).toBe(true);
  });

  it("every OFFERED stack has a summary for the option picker", () => {
    for (const s of STACK_ORDER) {
      expect(STACK_SUMMARIES[s].length).toBeGreaterThan(0);
      expect(STACK_SUMMARIES[s]).not.toMatch(/Pro plan|Pro tier|upgrade/i);
    }
  });
});
