/**
 * T-301 unit coverage for the tz-aware cron matcher.
 *
 * No DB, no clock. We construct explicit UTC instants and verify the
 * matcher projects them correctly into IANA zones, including:
 *   - same UTC minute hits different specs across KL / LA / London
 *   - days_of_week filter rejects same-time-wrong-day
 *   - weekly cadence honours weekday array
 *   - monthly fires only on day-of-month
 *   - Europe/London DST spring-forward boundary (2026-03-29 01:00 UTC):
 *     local clock skips 01:00 → 02:00 BST, so the 01:30 slot does NOT
 *     fire at any UTC minute on that date.
 */
import { describe, it, expect } from "vitest";
import { projectToZone, shouldFire, truncateToUtcMinute } from "@/server/cron/match";

describe("projectToZone", () => {
  it("projects a UTC instant into Asia/Kuala_Lumpur (+08:00, no DST)", () => {
    // 2026-06-02 00:00:00 UTC -> 2026-06-02 08:00 MYT (Tuesday)
    const z = projectToZone(new Date("2026-06-02T00:00:00Z"), "Asia/Kuala_Lumpur");
    expect(z.date).toBe("2026-06-02");
    expect(z.hhmm).toBe("08:00");
    expect(z.weekday).toBe(2); // Tue
  });

  it("projects a UTC instant into America/Los_Angeles (DST handling)", () => {
    // 2026-06-02 15:00 UTC -> 08:00 PDT (UTC-7)
    const z = projectToZone(new Date("2026-06-02T15:00:00Z"), "America/Los_Angeles");
    expect(z.hhmm).toBe("08:00");
    expect(z.weekday).toBe(2);
  });

  it("projects a UTC instant into Europe/London (BST = UTC+1)", () => {
    // 2026-06-02 07:00 UTC -> 08:00 BST
    const z = projectToZone(new Date("2026-06-02T07:00:00Z"), "Europe/London");
    expect(z.hhmm).toBe("08:00");
  });

  it("respects DST spring-forward: 2026-03-29 in London skips 01:00 BST", () => {
    // Clocks jump from 00:59 GMT (00:59 UTC) directly to 02:00 BST (01:00 UTC).
    // So at UTC 00:30 -> local 00:30 GMT (pre-jump), UTC 01:30 -> 02:30 BST
    // (post-jump). No UTC instant projects to "01:30" London on this date.
    const candidates = [
      "2026-03-29T00:30:00Z",
      "2026-03-29T01:00:00Z",
      "2026-03-29T01:30:00Z",
    ];
    const projections = candidates.map((iso) =>
      projectToZone(new Date(iso), "Europe/London").hhmm
    );
    expect(projections).not.toContain("01:30");
  });
});

describe("shouldFire", () => {
  const baseCadence = {
    frequency: "daily" as const,
    delivery_time_local: "08:00",
    days_of_week: [1, 2, 3, 4, 5],
  };

  it("fires for KL at 08:00 MYT on a Tuesday", () => {
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-02T00:00:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: baseCadence,
      })
    ).toBe(true);
  });

  it("fires for LA at the same wall-clock minute, different UTC instant", () => {
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-02T15:00:00Z"),
        timezone: "America/Los_Angeles",
        cadence: baseCadence,
      })
    ).toBe(true);
  });

  it("does not fire at the wrong minute", () => {
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-02T00:01:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: baseCadence,
      })
    ).toBe(false);
  });

  it("respects days_of_week — Sunday (7) excluded from M-F", () => {
    // 2026-06-07 00:00 UTC -> 08:00 MYT on Sunday
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-07T00:00:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: baseCadence,
      })
    ).toBe(false);
  });

  it("weekly cadence fires only on the specified weekday", () => {
    const weekly = {
      frequency: "weekly" as const,
      delivery_time_local: "08:00",
      days_of_week: [1], // Mondays only
    };
    // 2026-06-01 is a Monday in MYT
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-01T00:00:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: weekly,
      })
    ).toBe(true);
    // 2026-06-02 is a Tuesday
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-02T00:00:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: weekly,
      })
    ).toBe(false);
  });

  it("monthly fires only on day-of-month (default 1)", () => {
    const monthly = {
      frequency: "monthly" as const,
      delivery_time_local: "08:00",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
    };
    // 2026-06-01 MYT -> day 1
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-01T00:00:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: monthly,
      })
    ).toBe(true);
    // 2026-06-02 MYT -> day 2, skip
    expect(
      shouldFire({
        nowUtc: new Date("2026-06-02T00:00:00Z"),
        timezone: "Asia/Kuala_Lumpur",
        cadence: monthly,
      })
    ).toBe(false);
  });

  it("DST spring-forward: London 01:30 GMT/BST is unreachable on 2026-03-29", () => {
    const cadence = {
      frequency: "daily" as const,
      delivery_time_local: "01:30",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
    };
    // Probe every UTC minute around the boundary. None should fire.
    const probes = [
      "2026-03-29T00:00:00Z",
      "2026-03-29T00:30:00Z",
      "2026-03-29T01:00:00Z",
      "2026-03-29T01:30:00Z",
      "2026-03-29T02:00:00Z",
    ];
    for (const iso of probes) {
      expect(
        shouldFire({
          nowUtc: new Date(iso),
          timezone: "Europe/London",
          cadence,
        })
      ).toBe(false);
    }
  });

  it("DST fall-back: London 01:30 matcher fires at both UTC minutes on 2026-10-25", () => {
    // When clocks fall back, local 01:30 occurs at UTC 00:30 (BST) AND
    // UTC 01:30 (GMT). The matcher fires at BOTH instants by design — it's
    // a pure function of (UTC instant, tz, cadence). De-duping happens one
    // layer down at the dispatcher: migration 0007 added a partial UNIQUE
    // on (spec_id, delivery_calendar_day_local) so the second claim
    // collapses via ON CONFLICT DO NOTHING. See cron-dst-fallback.test.ts
    // for the end-to-end idempotency assertion.
    const cadence = {
      frequency: "daily" as const,
      delivery_time_local: "01:30",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
    };
    const fires = [
      "2026-10-25T00:30:00Z",
      "2026-10-25T01:30:00Z",
    ].map((iso) =>
      shouldFire({
        nowUtc: new Date(iso),
        timezone: "Europe/London",
        cadence,
      })
    );
    expect(fires).toEqual([true, true]);
  });
});

describe("truncateToUtcMinute", () => {
  it("strips seconds and milliseconds", () => {
    const d = new Date("2026-06-02T00:00:42.731Z");
    expect(truncateToUtcMinute(d).toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const m = truncateToUtcMinute(new Date("2026-06-02T00:00:42.731Z"));
    expect(truncateToUtcMinute(m).getTime()).toBe(m.getTime());
  });
});
