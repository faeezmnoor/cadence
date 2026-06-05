/**
 * Pure unit coverage for the multi-brief scheduling evaluator.
 *
 * No DB, no clock, no env. Table-driven fixtures cover:
 *   - daily / weekly / monthly happy paths
 *   - monthly "last" + Feb edge case
 *   - DST spring-forward (Europe/London 2026-03-29) and fall-back (2026-10-25)
 *   - skipDates + skipWhen.weekends
 *   - custom_cron round-trip
 *   - nextRunAt + shouldFire round-trip invariant
 */
import { describe, expect, it } from "vitest";
import { schedulingRuleV1, ruleFromLegacyCadence, type SchedulingRuleV1 } from "@/lib/scheduling/rule";
import { shouldFire, nextRunAt, cronMatchesMinute } from "@/lib/scheduling/evaluator";

function rule(overrides: Partial<SchedulingRuleV1> = {}): SchedulingRuleV1 {
  return schedulingRuleV1.parse({
    version: 1,
    startDate: "2026-01-01",
    endDate: null,
    timeLocal: "08:00",
    timezone: "Asia/Kuala_Lumpur",
    cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    skipDates: [],
    skipWhen: {},
    ...overrides,
  });
}

describe("shouldFire — daily cadence", () => {
  it("fires at 08:00 MYT on a Tuesday", () => {
    // 2026-06-02 00:00 UTC -> 08:00 MYT (Tue)
    expect(shouldFire(rule(), new Date("2026-06-02T00:00:00Z"))).toBe(true);
  });

  it("does not fire at 08:01 MYT", () => {
    expect(shouldFire(rule(), new Date("2026-06-02T00:01:00Z"))).toBe(false);
  });

  it("respects weekday filter (daily but weekdays-only)", () => {
    const r = rule({ cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5] } });
    // 2026-06-06 is a Saturday
    expect(shouldFire(r, new Date("2026-06-06T00:00:00Z"))).toBe(false);
  });
});

describe("shouldFire — weekly cadence", () => {
  it("fires only on the configured weekday", () => {
    const r = rule({ cadence: { kind: "weekly", weekdays: [3] } }); // Wed only
    expect(shouldFire(r, new Date("2026-06-03T00:00:00Z"))).toBe(true); // Wed
    expect(shouldFire(r, new Date("2026-06-02T00:00:00Z"))).toBe(false); // Tue
  });
});

describe("shouldFire — monthly cadence", () => {
  it("fires on the configured day-of-month", () => {
    const r = rule({ cadence: { kind: "monthly", monthlyDay: 1 } });
    expect(shouldFire(r, new Date("2026-06-01T00:00:00Z"))).toBe(true);
    expect(shouldFire(r, new Date("2026-06-02T00:00:00Z"))).toBe(false);
  });

  it("'last' resolves to the last day of the month", () => {
    const r = rule({ cadence: { kind: "monthly", monthlyDay: "last" } });
    // 2026-02-28 is last day of Feb 2026 (non-leap year)
    expect(shouldFire(r, new Date("2026-02-28T00:00:00Z"))).toBe(true);
    expect(shouldFire(r, new Date("2026-02-27T00:00:00Z"))).toBe(false);
    // 2026-04-30 is last day of April
    expect(shouldFire(r, new Date("2026-04-30T00:00:00Z"))).toBe(true);
  });
});

describe("shouldFire — skip filters", () => {
  it("respects ad-hoc skipDates", () => {
    const r = rule({ skipDates: ["2026-06-02"] });
    expect(shouldFire(r, new Date("2026-06-02T00:00:00Z"))).toBe(false);
    expect(shouldFire(r, new Date("2026-06-03T00:00:00Z"))).toBe(true);
  });

  it("respects skipWhen.weekends", () => {
    const r = rule({ skipWhen: { weekends: true } });
    // 2026-06-06 is Saturday
    expect(shouldFire(r, new Date("2026-06-06T00:00:00Z"))).toBe(false);
    // 2026-06-08 is Monday
    expect(shouldFire(r, new Date("2026-06-08T00:00:00Z"))).toBe(true);
  });

  it("respects startDate / endDate window", () => {
    const r = rule({ startDate: "2026-06-10", endDate: "2026-06-20" });
    expect(shouldFire(r, new Date("2026-06-09T00:00:00Z"))).toBe(false);
    expect(shouldFire(r, new Date("2026-06-15T00:00:00Z"))).toBe(true);
    expect(shouldFire(r, new Date("2026-06-21T00:00:00Z"))).toBe(false);
  });
});

describe("shouldFire — DST", () => {
  it("Europe/London spring-forward 2026-03-29 — 02:30 BST does NOT exist", () => {
    const r = rule({ timezone: "Europe/London", timeLocal: "02:30" });
    // 2026-03-29: clocks jump 01:00 UTC (= 01:00 GMT) -> 02:00 BST.
    // Local 02:30 BST = 01:30 UTC. Verify that this UTC instant maps back
    // to 02:30 local AND fires (the matcher just needs the projection to
    // agree).
    expect(shouldFire(r, new Date("2026-03-29T01:30:00Z"))).toBe(true);
  });

  it("Europe/London fall-back 2026-10-25 — 01:30 happens twice", () => {
    const r = rule({ timezone: "Europe/London", timeLocal: "01:30" });
    // 01:30 BST = 00:30 UTC; 01:30 GMT = 01:30 UTC. Both should match
    // wall-clock 01:30. (The dispatcher uses a calendar-day idempotency
    // anchor to avoid double-firing — that lives in cron-dispatch.ts.)
    expect(shouldFire(r, new Date("2026-10-25T00:30:00Z"))).toBe(true);
    expect(shouldFire(r, new Date("2026-10-25T01:30:00Z"))).toBe(true);
  });
});

describe("nextRunAt", () => {
  it("returns null when endDate is in the past", () => {
    const r = rule({ endDate: "2025-01-01" });
    expect(nextRunAt(r, new Date("2026-06-02T00:00:00Z"))).toBeNull();
  });

  it("finds the next daily 08:00 MYT", () => {
    const r = rule(); // daily 08:00 MYT
    const next = nextRunAt(r, new Date("2026-06-01T23:00:00Z")); // 07:00 MYT Tue
    expect(next?.toISOString()).toBe("2026-06-02T00:00:00.000Z"); // 08:00 MYT
  });

  it("finds the next weekly Wednesday", () => {
    const r = rule({ cadence: { kind: "weekly", weekdays: [3] }, timeLocal: "09:00" });
    // 2026-06-02 Tue 09:00 UTC: next Wed 09:00 MYT = 2026-06-03 01:00 UTC
    const next = nextRunAt(r, new Date("2026-06-02T09:00:00Z"));
    expect(next?.toISOString()).toBe("2026-06-03T01:00:00.000Z");
  });

  it("round-trip: shouldFire(rule, nextRunAt(rule, now)) === true", () => {
    const fixtures: Array<{ name: string; r: SchedulingRuleV1; now: Date }> = [
      { name: "daily MYT", r: rule(), now: new Date("2026-06-01T00:00:00Z") },
      {
        name: "weekly Wed",
        r: rule({ cadence: { kind: "weekly", weekdays: [3] } }),
        now: new Date("2026-06-01T00:00:00Z"),
      },
      {
        name: "monthly 1st",
        r: rule({ cadence: { kind: "monthly", monthlyDay: 1 } }),
        now: new Date("2026-06-02T00:00:00Z"),
      },
      {
        name: "monthly last (Feb)",
        r: rule({ cadence: { kind: "monthly", monthlyDay: "last" }, timeLocal: "07:30" }),
        now: new Date("2026-02-01T00:00:00Z"),
      },
    ];
    for (const { name, r, now } of fixtures) {
      const fire = nextRunAt(r, now);
      expect(fire, `${name}: nextRunAt returned null`).not.toBeNull();
      expect(shouldFire(r, fire!), `${name}: should fire at nextRunAt`).toBe(true);
    }
  });
});

describe("cronMatchesMinute", () => {
  it("matches '0 7 * * 1-5' on Mon-Fri 07:00 UTC", () => {
    // 2026-06-02 is Tue
    expect(cronMatchesMinute("0 7 * * 1-5", new Date("2026-06-02T07:00:00Z"))).toBe(true);
    expect(cronMatchesMinute("0 7 * * 1-5", new Date("2026-06-02T07:01:00Z"))).toBe(false);
    // 2026-06-06 is Sat
    expect(cronMatchesMinute("0 7 * * 1-5", new Date("2026-06-06T07:00:00Z"))).toBe(false);
  });

  it("matches '*/15 * * * *' every 15 minutes", () => {
    expect(cronMatchesMinute("*/15 * * * *", new Date("2026-06-02T07:00:00Z"))).toBe(true);
    expect(cronMatchesMinute("*/15 * * * *", new Date("2026-06-02T07:15:00Z"))).toBe(true);
    expect(cronMatchesMinute("*/15 * * * *", new Date("2026-06-02T07:14:00Z"))).toBe(false);
  });
});

describe("ruleFromLegacyCadence", () => {
  it("maps legacy daily + weekdays array", () => {
    const r = ruleFromLegacyCadence({
      cadence: { frequency: "daily", delivery_time_local: "07:30", days_of_week: [1, 2, 3, 4, 5] },
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-01-01",
    });
    expect(r.cadence.kind).toBe("daily");
    expect(r.timeLocal).toBe("07:30");
    expect(r.timezone).toBe("Asia/Kuala_Lumpur");
  });

  it("maps legacy weekly → kind:weekly", () => {
    const r = ruleFromLegacyCadence({
      cadence: { frequency: "weekly", delivery_time_local: "09:00", days_of_week: [3] },
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-01-01",
    });
    expect(r.cadence.kind).toBe("weekly");
  });

  it("maps legacy monthly → kind:monthly day=1", () => {
    const r = ruleFromLegacyCadence({
      cadence: { frequency: "monthly", delivery_time_local: "08:00" },
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-01-01",
    });
    expect(r.cadence.kind).toBe("monthly");
    if (r.cadence.kind === "monthly") expect(r.cadence.monthlyDay).toBe(1);
  });
});
