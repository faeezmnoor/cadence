/**
 * Settings-surfacing v1 (gap 1): timezone re-derivation edges.
 *
 * Pure tests on lib/scheduling/retime.ts — the helper account.updateTimezone
 * runs for every active brief when the user changes timezone. The PRD §4.1
 * contract under test:
 *
 *   - passed-today    : if the local delivery time already passed today in
 *                       the NEW zone, next delivery is the next valid
 *                       occurrence (never two on one local day, never a
 *                       skip longer than one cycle).
 *   - not-yet-today   : if it hasn't passed, the next delivery is TODAY in
 *                       the new zone.
 *   - weekly boundary : a weekly rule re-anchors to the same weekday in
 *                       the new zone, even when the zone shift moves the
 *                       UTC instant across a calendar-day boundary.
 *   - DST             : zones are handled per-occurrence from the IANA id
 *                       (no fixed offsets) — the same local time maps to
 *                       different UTC offsets either side of a transition.
 *   - preservation    : a valid persisted rule keeps its skipDates /
 *                       skipWhen / startDate; only the timezone swaps.
 *                       Invalid/legacy scheduling falls back to the
 *                       save-spec.ts path (ruleFromLegacyCadence).
 */
import { describe, expect, it } from "vitest";
import {
  isValidIanaTimezone,
  rederiveScheduleForTimezone,
} from "@/lib/scheduling/retime";
import type { SchedulingRuleV1 } from "@/lib/scheduling/rule";

function dailyRule(timezone: string, timeLocal = "08:00"): SchedulingRuleV1 {
  return {
    version: 1,
    startDate: "2026-01-01",
    endDate: null,
    timeLocal,
    timezone,
    cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    skipDates: [],
    skipWhen: {},
  };
}

describe("rederiveScheduleForTimezone — occurrence edges", () => {
  it("passed-today: new local 08:00 already gone → next occurrence is tomorrow, exactly one cycle out", () => {
    // Now = 2026-06-12T01:30Z = 09:30 in Singapore (UTC+8) — 08:00 SGT
    // (00:00Z) has passed. Next must be 2026-06-13T00:00Z (tomorrow
    // 08:00 SGT), not today's and not two days out.
    const now = new Date("2026-06-12T01:30:00.000Z");
    const { scheduling, nextRunAt } = rederiveScheduleForTimezone({
      existingScheduling: dailyRule("Asia/Kuala_Lumpur"),
      timezone: "Asia/Singapore",
      now,
    });
    expect(scheduling.timezone).toBe("Asia/Singapore");
    expect(nextRunAt?.toISOString()).toBe("2026-06-13T00:00:00.000Z");
  });

  it("not-yet-today: new local 08:00 still ahead → next occurrence is today", () => {
    // Now = 2026-06-11T22:00Z = 06:00 on 2026-06-12 in Singapore — 08:00
    // SGT today (2026-06-12T00:00Z) hasn't happened yet.
    const now = new Date("2026-06-11T22:00:00.000Z");
    const { nextRunAt } = rederiveScheduleForTimezone({
      existingScheduling: dailyRule("Asia/Kuala_Lumpur"),
      timezone: "Asia/Singapore",
      now,
    });
    expect(nextRunAt?.toISOString()).toBe("2026-06-12T00:00:00.000Z");
  });

  it("weekly boundary: Monday-08:00 rule re-anchors to Monday in the new zone across the UTC day boundary", () => {
    // Weekly Monday 08:00. 2026-06-12 is a Friday. Moving KL → Auckland
    // (UTC+12): Monday 08:00 NZST = Sunday 20:00 UTC. The evaluator must
    // land on the LOCAL Monday (2026-06-15 in Auckland → 2026-06-14T20:00Z),
    // not on the UTC Monday.
    const rule: SchedulingRuleV1 = {
      ...dailyRule("Asia/Kuala_Lumpur"),
      cadence: { kind: "weekly", weekdays: [1] },
    };
    const now = new Date("2026-06-12T10:00:00.000Z");
    const { nextRunAt } = rederiveScheduleForTimezone({
      existingScheduling: rule,
      timezone: "Pacific/Auckland",
      now,
    });
    expect(nextRunAt?.toISOString()).toBe("2026-06-14T20:00:00.000Z");
  });

  it("DST zone: occurrences derive per-occurrence from the IANA id, not a fixed offset", () => {
    // US DST starts Sunday 2026-03-08. Daily 08:00 New York:
    //   Sat 2026-03-07 08:00 EST  = 13:00Z
    //   Sun 2026-03-08 08:00 EDT  = 12:00Z  ← offset shifts, local time holds
    const now = new Date("2026-03-06T20:00:00.000Z"); // Fri 15:00 EST
    const { nextRunAt: first } = rederiveScheduleForTimezone({
      existingScheduling: dailyRule("Asia/Kuala_Lumpur"),
      timezone: "America/New_York",
      now,
    });
    expect(first?.toISOString()).toBe("2026-03-07T13:00:00.000Z");

    // From just after Saturday's delivery, the next one is Sunday at the
    // NEW offset — same 08:00 local, one hour earlier in UTC.
    const { nextRunAt: second } = rederiveScheduleForTimezone({
      existingScheduling: dailyRule("America/New_York"),
      timezone: "America/New_York",
      now: new Date("2026-03-07T13:01:00.000Z"),
    });
    expect(second?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
  });

  it("KL → KL is a no-op for the schedule (a KL user sees zero behavior change)", () => {
    const now = new Date("2026-06-12T01:30:00.000Z"); // 09:30 MYT
    const before = rederiveScheduleForTimezone({
      existingScheduling: dailyRule("Asia/Kuala_Lumpur"),
      timezone: "Asia/Kuala_Lumpur",
      now,
    });
    expect(before.nextRunAt?.toISOString()).toBe("2026-06-13T00:00:00.000Z");
    expect(before.scheduling).toEqual(dailyRule("Asia/Kuala_Lumpur"));
  });
});

describe("rederiveScheduleForTimezone — rule preservation + fallback", () => {
  it("preserves skipDates / skipWhen / startDate from a valid persisted rule", () => {
    const rule: SchedulingRuleV1 = {
      ...dailyRule("Asia/Kuala_Lumpur"),
      skipDates: ["2026-06-13"],
      skipWhen: { weekends: true },
    };
    const now = new Date("2026-06-12T01:30:00.000Z"); // Fri 09:30 MYT
    const { scheduling, nextRunAt } = rederiveScheduleForTimezone({
      existingScheduling: rule,
      timezone: "Asia/Singapore",
      now,
    });
    expect(scheduling.skipDates).toEqual(["2026-06-13"]);
    expect(scheduling.skipWhen).toEqual({ weekends: true });
    expect(scheduling.startDate).toBe("2026-01-01");
    // 13th is skipDated, 13th/14th are a weekend (skipWhen) → Monday 15th.
    expect(nextRunAt?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("falls back to the save-spec path (ruleFromLegacyCadence) when scheduling is invalid/legacy", () => {
    const now = new Date("2026-06-12T01:30:00.000Z");
    const { scheduling, nextRunAt } = rederiveScheduleForTimezone({
      cadence: {
        frequency: "daily",
        delivery_time_local: "07:30",
        days_of_week: [1, 2, 3, 4, 5],
      },
      existingScheduling: {}, // pre-Phase-A legacy '{}' jsonb
      timezone: "Asia/Singapore",
      now,
    });
    expect(scheduling.timezone).toBe("Asia/Singapore");
    expect(scheduling.timeLocal).toBe("07:30");
    expect(scheduling.cadence).toEqual({
      kind: "daily",
      weekdays: [1, 2, 3, 4, 5],
    });
    // 07:30 SGT passed (it's 09:30) and 13th/14th are Sat/Sun (excluded
    // by days_of_week) → Monday 15th 07:30 SGT = 2026-06-14T23:30Z.
    expect(nextRunAt?.toISOString()).toBe("2026-06-14T23:30:00.000Z");
  });
});

describe("isValidIanaTimezone", () => {
  it("accepts real IANA ids and rejects garbage", () => {
    expect(isValidIanaTimezone("Asia/Kuala_Lumpur")).toBe(true);
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidIanaTimezone("GMT+8")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
  });
});
