/**
 * Phase B T3 — unit tests for `briefsPerDayForRule`.
 *
 * Pure-function coverage: daily / weekly / monthly / custom_cron, plus
 * the skipWhen.weekends shaver. We don't exercise the router/db here;
 * the burn aggregation in `portfolioBurn` is just a sum + tier multiply.
 */
import { describe, it, expect } from "vitest";
import { briefsPerDayForRule } from "@/server/trpc/routers/briefs";
import { schedulingRuleV1, type SchedulingRuleV1 } from "@/lib/scheduling/rule";

const base = {
  version: 1 as const,
  startDate: "2026-06-01",
  endDate: null,
  timeLocal: "08:00",
  timezone: "Asia/Kuala_Lumpur",
  skipDates: [],
  skipWhen: {},
};

function rule(cadence: SchedulingRuleV1["cadence"], skipWeekends = false): SchedulingRuleV1 {
  return schedulingRuleV1.parse({
    ...base,
    cadence,
    skipWhen: skipWeekends ? { weekends: true } : {},
  });
}

describe("briefsPerDayForRule", () => {
  it("daily every day = 1.0", () => {
    expect(briefsPerDayForRule(rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }))).toBeCloseTo(1);
  });
  it("daily weekdays only = 5/7", () => {
    expect(briefsPerDayForRule(rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5] }))).toBeCloseTo(5 / 7);
  });
  it("weekly Mon+Wed = 2/7", () => {
    expect(briefsPerDayForRule(rule({ kind: "weekly", weekdays: [1, 3] }))).toBeCloseTo(2 / 7);
  });
  it("monthly = 1/30", () => {
    expect(briefsPerDayForRule(rule({ kind: "monthly", monthlyDay: 1 }))).toBeCloseTo(1 / 30);
  });
  it("custom_cron falls back to 1/7", () => {
    expect(briefsPerDayForRule(rule({ kind: "custom_cron", cronExpr: "0 8 * * *" }))).toBeCloseTo(1 / 7);
  });
  it("skipWhen.weekends shaves daily 7-day down to 5/7", () => {
    expect(
      briefsPerDayForRule(rule({ kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] }, true))
    ).toBeCloseTo(5 / 7);
  });
});
