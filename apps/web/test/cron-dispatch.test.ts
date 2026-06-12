/**
 * CAD-217 — dispatcher resilience contract.
 *
 * The rewrite's invariants:
 *   1. A LATE tick still fires a due spec (no exact-minute match, no
 *      back-look window) — the old design stranded any schedule whose
 *      minute was missed once.
 *   2. Claims anchor to the SCHEDULED minute, not the wall-clock minute,
 *      so racing/late ticks collapse on the unique index.
 *   3. next_run_at advances on EVERY outcome: claim, collision, and
 *      rule-skip (advance-on-skip) — a skipped occurrence can never wedge
 *      the schedule.
 *   4. Reconcile repairs active specs with NULL next_run_at.
 *
 * Harness: table-identity db mock (auto-heal.test.ts pattern); the inngest
 * client's send is mocked at the module boundary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sentEvents: Array<Record<string, unknown>> = [];
vi.mock("@/server/inngest/client", () => ({
  inngest: {
    send: vi.fn(async (evt: Record<string, unknown>) => {
      sentEvents.push(evt);
    }),
    createFunction: vi.fn((_opts: unknown, _fn: unknown) => ({})),
  },
}));

const updateCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
let nextClaimReturning: Array<{ id: string }> = [{ id: "run-1" }];
const state: { rows: unknown[]; staleRows: unknown[] } = { rows: [], staleRows: [] };

vi.mock("@/server/db/client", async () => {
  const schema = await vi.importActual<typeof import("@/server/db/schema")>(
    "@/server/db/schema"
  );
  return {
    db: {
      select() {
        let joined = false;
        let whereCount = 0;
        const chain = {
          from() {
            return chain;
          },
          innerJoin(_t: unknown, cond: unknown) {
            joined = true;
            // The reconcile query filters NULL next_run_at via where();
            // the dispatch query embeds due-ness in the join condition.
            void cond;
            return chain;
          },
          where() {
            whereCount++;
            return chain;
          },
          limit() {
            return Promise.resolve(state.staleRows);
          },
          then(resolve: (rows: unknown[]) => unknown) {
            void joined;
            void whereCount;
            return Promise.resolve(state.rows).then(resolve);
          },
        };
        return chain;
      },
      insert(table: unknown) {
        return {
          values(v: Record<string, unknown>) {
            insertCalls.push({ table, values: v });
            return {
              returning: () => ({
                onConflictDoNothing: () => Promise.resolve(nextClaimReturning),
              }),
            };
          },
        };
      },
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            updateCalls.push({ table, values });
            return { where: () => Promise.resolve(undefined) };
          },
        };
      },
    },
  };
});

import { dispatchDueSpecs, reconcileNullNextRun } from "@/server/inngest/functions/cron-dispatch";
import { digestSpecs, digestRuns } from "@/server/db/schema";

/** A daily-08:00-KL rule (UTC+8 → 00:00 UTC). */
function dailyRule() {
  return {
    version: 1,
    timezone: "Asia/Kuala_Lumpur",
    timeLocal: "08:00",
    startDate: "2026-01-01",
    endDate: null,
    cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    skipDates: [],
    skipWhen: { weekends: false, malaysianPublicHolidays: false },
  };
}

function dueSpecRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "user-1",
    timezone: "Asia/Kuala_Lumpur",
    // Settings-surfacing v1 (gap 3): the dispatcher now selects the
    // owner's telegramChatId and skips unlinked users without claiming
    // (covered in test/unlink-skip.test.ts). The base fixture models a
    // LINKED user so the CAD-217 invariants stay exercised end-to-end.
    telegramChatId: 123456789,
    specId: "spec-1",
    scheduling: dailyRule(),
    // 08:00 MYT on 2026-06-11 == 00:00 UTC
    nextRunAt: new Date("2026-06-11T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  sentEvents.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  nextClaimReturning = [{ id: "run-1" }];
  state.rows = [];
  state.staleRows = [];
});

describe("CAD-217 — windowed due-check", () => {
  it("fires a due spec even on a LATE tick (4 minutes past)", async () => {
    state.rows = [dueSpecRow()];
    const lateTick = new Date("2026-06-11T00:04:00.000Z");

    const summary = await dispatchDueSpecs(lateTick);

    expect(summary.claimed).toBe(1);
    expect(summary.ruleSkips).toBe(0);
    expect(sentEvents).toHaveLength(1);
  });

  it("fires a due spec even HOURS late (outage recovery — old design lost it forever)", async () => {
    state.rows = [dueSpecRow()];
    const muchLater = new Date("2026-06-11T03:30:00.000Z");

    const summary = await dispatchDueSpecs(muchLater);

    expect(summary.claimed).toBe(1);
    // next_run_at advanced PAST now (catch-up delivers one, then jumps
    // to the future — no backlog flood).
    const specAdvances = updateCalls.filter((c) => c.table === digestSpecs);
    expect(specAdvances).toHaveLength(1);
    const nextAt = specAdvances[0]!.values.nextRunAt as Date;
    expect(nextAt.getTime()).toBeGreaterThan(muchLater.getTime());
  });

  it("anchors the claim to the SCHEDULED minute, not the wall-clock minute", async () => {
    state.rows = [dueSpecRow()];
    await dispatchDueSpecs(new Date("2026-06-11T00:04:33.000Z"));

    const claim = insertCalls.find((c) => c.table === digestRuns);
    expect(claim).toBeDefined();
    expect((claim!.values.deliveryMinuteUtc as Date).toISOString()).toBe(
      "2026-06-11T00:00:00.000Z"
    );
    expect(claim!.values.runDate).toBe("2026-06-11");
  });

  it("rule edited since next_run_at (skipDate added): skips firing but STILL advances", async () => {
    // The scheduled local date is now skipped — rule edited after
    // next_run_at was computed.
    const rule = { ...dailyRule(), skipDates: ["2026-06-11"] };
    state.rows = [dueSpecRow({ scheduling: rule })];

    const summary = await dispatchDueSpecs(new Date("2026-06-11T00:02:00.000Z"));

    expect(summary.ruleSkips).toBe(1);
    expect(summary.claimed).toBe(0);
    expect(sentEvents).toHaveLength(0);
    // Advance-on-skip: the schedule must not wedge.
    const specAdvances = updateCalls.filter((c) => c.table === digestSpecs);
    expect(specAdvances).toHaveLength(1);
    expect(specAdvances[0]!.values.nextRunAt).toBeInstanceOf(Date);
  });

  it("claim collision (concurrent tick already won): counts collision, advances, sends nothing", async () => {
    nextClaimReturning = []; // ON CONFLICT DO NOTHING → no row back
    state.rows = [dueSpecRow()];

    const summary = await dispatchDueSpecs(new Date("2026-06-11T00:01:00.000Z"));

    expect(summary.collisions).toBe(1);
    expect(summary.claimed).toBe(0);
    expect(sentEvents).toHaveLength(0);
    expect(updateCalls.filter((c) => c.table === digestSpecs)).toHaveLength(1);
  });

  it("invalid scheduling rule: error recorded, nothing fired", async () => {
    state.rows = [dueSpecRow({ scheduling: { garbage: true } })];

    const summary = await dispatchDueSpecs(new Date("2026-06-11T00:01:00.000Z"));

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]!.error).toBe("invalid_scheduling_rule");
    expect(sentEvents).toHaveLength(0);
  });
});

describe("CAD-217 — reconcile NULL next_run_at", () => {
  it("recomputes next_run_at for active specs that lost it", async () => {
    state.staleRows = [{ specId: "spec-9", scheduling: dailyRule() }];

    const fixed = await reconcileNullNextRun();

    expect(fixed).toBe(1);
    const specUpdates = updateCalls.filter((c) => c.table === digestSpecs);
    expect(specUpdates).toHaveLength(1);
    expect(specUpdates[0]!.values.nextRunAt).toBeInstanceOf(Date);
  });

  it("skips corrupt rules without throwing", async () => {
    state.staleRows = [{ specId: "spec-9", scheduling: { nope: 1 } }];
    const fixed = await reconcileNullNextRun();
    expect(fixed).toBe(0);
  });
});
