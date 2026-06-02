/**
 * CAD-36 follow-up: DST fall-back duplicate-fire regression.
 *
 * The matcher correctly returns true at BOTH UTC minutes that map to local
 * 01:30 on the DST fall-back day (documented in cron-match.test.ts). The
 * dispatcher's job is to make sure only ONE digest_runs row survives — the
 * second claim must collapse via ON CONFLICT DO NOTHING because the
 * (spec_id, delivery_calendar_day_local) partial UNIQUE index from
 * migration 0007 catches the same-local-day fire even though the two
 * UTC minutes are distinct (so the (spec_id, delivery_minute_utc) index
 * from 0004 lets both through).
 *
 * This test reproduces the QA's London 2026-10-25 scenario at the
 * idempotency-contract level: a tiny in-memory store that emulates both
 * partial UNIQUE indexes, then drives the same two dispatch claims the
 * production dispatcher would issue. Expectation: one row.
 */
import { describe, it, expect } from "vitest";
import { projectToZone, shouldFire } from "@/server/cron/match";

interface FakeRun {
  id: string;
  specId: string;
  deliveryMinuteUtc: string; // ISO
  deliveryCalendarDayLocal: string; // YYYY-MM-DD
}

/**
 * Tiny store emulating the two partial UNIQUE indexes defined on
 * digest_runs (specMinuteUq + specLocalDayUq). claim() returns the row id
 * on success, null on collision.
 */
function makeStore() {
  const rows: FakeRun[] = [];
  let seq = 0;
  return {
    claim(input: Omit<FakeRun, "id">): FakeRun | null {
      const minuteHit = rows.find(
        (r) =>
          r.specId === input.specId &&
          r.deliveryMinuteUtc === input.deliveryMinuteUtc
      );
      if (minuteHit) return null;
      const dayHit = rows.find(
        (r) =>
          r.specId === input.specId &&
          r.deliveryCalendarDayLocal === input.deliveryCalendarDayLocal
      );
      if (dayHit) return null;
      const row: FakeRun = { id: `run-${++seq}`, ...input };
      rows.push(row);
      return row;
    },
    all() {
      return rows.slice();
    },
  };
}

describe("DST fall-back duplicate-fire (London 2026-10-25)", () => {
  const cadence = {
    frequency: "daily" as const,
    delivery_time_local: "01:30",
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
  };
  const tz = "Europe/London";
  const specId = "spec-london";

  it("matcher still fires at both UTC minutes (unchanged behaviour)", () => {
    const fires = ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"].map((iso) =>
      shouldFire({ nowUtc: new Date(iso), timezone: tz, cadence })
    );
    expect(fires).toEqual([true, true]);
  });

  it("dispatcher claim is idempotent at the local-day layer — exactly ONE row", () => {
    const store = makeStore();

    // Two cron fires the dispatcher would process: 00:30Z (BST 01:30) and
    // 01:30Z (GMT 01:30 — same wall-clock).
    const fires = ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"];
    for (const iso of fires) {
      const nowUtc = new Date(iso);
      // Mirror cron-dispatch.ts logic.
      const minuteUtc = new Date(nowUtc.getTime() - (nowUtc.getTime() % 60000));
      const localDay = projectToZone(nowUtc, tz).date;
      store.claim({
        specId,
        deliveryMinuteUtc: minuteUtc.toISOString(),
        deliveryCalendarDayLocal: localDay,
      });
    }

    const all = store.all();
    expect(all).toHaveLength(1);
    // The surviving row should be the FIRST fire (00:30Z BST) — that's the
    // one our claim path picks up first chronologically.
    expect(all[0]!.deliveryMinuteUtc).toBe("2026-10-25T00:30:00.000Z");
    expect(all[0]!.deliveryCalendarDayLocal).toBe("2026-10-25");
  });

  it("non-DST day still allows the single daily fire (no false positive)", () => {
    const store = makeStore();
    const nowUtc = new Date("2026-06-02T00:30:00Z"); // London BST 01:30
    const minuteUtc = new Date(nowUtc.getTime() - (nowUtc.getTime() % 60000));
    const localDay = projectToZone(nowUtc, tz).date;
    const claimed = store.claim({
      specId,
      deliveryMinuteUtc: minuteUtc.toISOString(),
      deliveryCalendarDayLocal: localDay,
    });
    expect(claimed).not.toBeNull();
    expect(store.all()).toHaveLength(1);
  });
});
