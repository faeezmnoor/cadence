/**
 * Settings-surfacing v1 (gap 3): unlinked users are skipped, not charged.
 *
 * The contract under test (PRD §4.2 flow B):
 *   - dispatcher: a due spec whose owner has no telegramChatId is skipped
 *     WITHOUT claiming a run row (zero debit, zero failed rows) but
 *     next_run_at STILL advances (advance-on-skip — schedule never
 *     wedges; delivery resumes at the next occurrence after relink).
 *   - pipeline: belt-and-suspenders — if a run reaches runDigestPipeline
 *     for an unlinked user (race: unlink landed between claim and run),
 *     it returns "skipped_unlinked" BEFORE composing, debiting, or
 *     writing any transactions/failed row; the claimed row is marked
 *     skipped, not failed (no delivery_broken escalation).
 *
 * Harness: module-boundary db mock (digest-retry.test.ts /
 * cron-dispatch.test.ts pattern); the inngest client is mocked too.
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
const state: { limitRows: unknown[]; dispatchRows: unknown[] } = {
  limitRows: [],
  dispatchRows: [],
};

vi.mock("@/server/db/client", () => ({
  db: {
    select() {
      const chain = {
        from() {
          return chain;
        },
        innerJoin() {
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        // run.ts user lookup ends in .limit(1)
        limit() {
          return Promise.resolve(state.limitRows);
        },
        // cron-dispatch due-query is awaited directly (thenable)
        then(
          resolve: (rows: unknown[]) => unknown,
          reject?: (err: unknown) => unknown
        ) {
          return Promise.resolve(state.dispatchRows).then(resolve, reject);
        },
      };
      return chain;
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          updateCalls.push({ table, values });
          return { where: () => Promise.resolve([]) };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(v: Record<string, unknown>) {
          insertCalls.push({ table, values: v });
          const rows = [{ id: "run-x" }];
          return {
            returning: () =>
              Object.assign(Promise.resolve(rows), {
                onConflictDoNothing: () => Promise.resolve(rows),
              }),
          };
        },
      };
    },
  },
}));

import { dispatchDueSpecs } from "@/server/inngest/functions/cron-dispatch";
import { runDigestPipeline } from "@/server/digest/run";
import { digestRuns, digestSpecs, transactions } from "@/server/db/schema";

function dailyRule() {
  return {
    version: 1,
    timezone: "Asia/Kuala_Lumpur",
    timeLocal: "08:00",
    startDate: "2026-01-01",
    endDate: null,
    cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    skipDates: [],
    skipWhen: {},
  };
}

beforeEach(() => {
  sentEvents.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  state.limitRows = [];
  state.dispatchRows = [];
});

describe("dispatcher — unlinked skip (advance without firing)", () => {
  it("skips an unlinked user's due spec: no claim, no event, next_run_at advances", async () => {
    state.dispatchRows = [
      {
        userId: "user-1",
        timezone: "Asia/Kuala_Lumpur",
        telegramChatId: null, // ← unlinked
        specId: "spec-1",
        scheduling: dailyRule(),
        nextRunAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    ];

    const summary = await dispatchDueSpecs(new Date("2026-06-11T00:02:00.000Z"));

    expect(summary.unlinkedSkips).toBe(1);
    expect(summary.claimed).toBe(0);
    expect(summary.errors).toHaveLength(0);
    // Zero run rows claimed → zero debit, zero failed rows downstream.
    expect(insertCalls.filter((c) => c.table === digestRuns)).toHaveLength(0);
    expect(sentEvents).toHaveLength(0);
    // Advance-on-skip: the schedule must not wedge while disconnected.
    const specAdvances = updateCalls.filter((c) => c.table === digestSpecs);
    expect(specAdvances).toHaveLength(1);
    const nextAt = specAdvances[0]!.values.nextRunAt as Date;
    expect(nextAt).toBeInstanceOf(Date);
    expect(nextAt.getTime()).toBeGreaterThan(
      new Date("2026-06-11T00:02:00.000Z").getTime()
    );
  });

  it("linked user on the same tick still claims and fires (control)", async () => {
    state.dispatchRows = [
      {
        userId: "user-1",
        timezone: "Asia/Kuala_Lumpur",
        telegramChatId: 12345,
        specId: "spec-1",
        scheduling: dailyRule(),
        nextRunAt: new Date("2026-06-11T00:00:00.000Z"),
      },
    ];

    const summary = await dispatchDueSpecs(new Date("2026-06-11T00:02:00.000Z"));

    expect(summary.unlinkedSkips).toBe(0);
    expect(summary.claimed).toBe(1);
    expect(insertCalls.filter((c) => c.table === digestRuns)).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);
  });
});

describe("pipeline — unlinked gate (race fallback)", () => {
  const unlinkedUser = {
    id: "user-1",
    email: "user@example.com",
    timezone: "Asia/Kuala_Lumpur",
    telegramChatId: null,
    telegramUsername: null,
    state: "active",
    creditsBalance: 5,
    distilledPrefs: null,
  };

  it("returns skipped_unlinked before any claim/debit; marks the pre-claimed row skipped", async () => {
    state.limitRows = [unlinkedUser];

    const result = await runDigestPipeline({
      userId: "user-1",
      digestRunId: "claimed-run-1",
    });

    expect(result.status).toBe("skipped_unlinked");
    expect(result.digestRunId).toBe("claimed-run-1");
    expect(result.markdown).toBeNull();

    // ZERO debit, ZERO skip-bookkeeping charge rows, ZERO failed rows:
    // nothing is inserted anywhere (transactions included).
    expect(insertCalls).toHaveLength(0);
    expect(
      insertCalls.filter((c) => c.table === transactions)
    ).toHaveLength(0);

    // The claimed row is marked skipped (not failed → no attempt_count
    // bump, no delivery_broken escalation in the Inngest handler).
    const runUpdates = updateCalls.filter((c) => c.table === digestRuns);
    expect(runUpdates).toHaveLength(1);
    expect(runUpdates[0]!.values.status).toBe("skipped_unlinked");

    // The spec is NOT paused (unlike the no-credits skip) — briefs stay
    // in their prior status while delivery is on hold.
    expect(updateCalls.filter((c) => c.table === digestSpecs)).toHaveLength(0);
  });

  it("manual path (no claimed row): clean skip with no writes at all", async () => {
    state.limitRows = [unlinkedUser];

    const result = await runDigestPipeline({ userId: "user-1" });

    expect(result.status).toBe("skipped_unlinked");
    expect(result.digestRunId).toBeNull();
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });
});
