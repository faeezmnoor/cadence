/**
 * Brief manage mode — ensureManageThread lazy-create (plan §4.2, AC7.2,
 * exec advisory 14).
 *
 * Module-boundary tests (mock db + Sentry):
 *   - existing active bound thread → returned, NO insert, no seed
 *   - none → exactly one thread insert (purpose=reconfigure, specId bound)
 *     + exactly two seeded assistant rows in render order
 *   - unique-violation race (chat_threads_spec_active_uq) → re-select the
 *     winner + Sentry breadcrumb asserted (the one race unreproducible in
 *     QA — we lock the recovery path here instead)
 *   - non-unique errors rethrow untouched
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as Array<Array<Record<string, unknown>>>,
  threadInserts: [] as Array<Record<string, unknown>>,
  messageInserts: [] as Array<Array<Record<string, unknown>>>,
  insertError: null as unknown,
  insertedThread: null as Record<string, unknown> | null,
}));

const breadcrumbs = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: (b: Record<string, unknown>) => {
    breadcrumbs.push(b);
  },
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/db/schema", () => ({
  chatThreads: { __name: "chat_threads" },
  chatMessages: { __name: "chat_messages" },
}));

vi.mock("@/server/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () =>
              Promise.resolve(state.selectResults.shift() ?? []),
          }),
        }),
      }),
    }),
    insert: (table: { __name?: string }) => ({
      values: (v: Record<string, unknown> | Array<Record<string, unknown>>) => {
        if (table.__name === "chat_messages") {
          state.messageInserts.push(v as Array<Record<string, unknown>>);
          return Promise.resolve();
        }
        state.threadInserts.push(v as Record<string, unknown>);
        return {
          returning: () => {
            if (state.insertError) {
              const err = state.insertError;
              state.insertError = null;
              return Promise.reject(err);
            }
            return Promise.resolve([state.insertedThread]);
          },
        };
      },
    }),
  },
}));

import { ensureManageThread, isUniqueViolation } from "@/server/chat/manage-thread";

const USER = "u-self";
const SPEC_ID = "11111111-1111-1111-1111-111111111111";
const THREAD = {
  id: "tttttttt-tttt-tttt-tttt-tttttttttttt",
  userId: USER,
  purpose: "reconfigure",
  status: "active",
  specId: SPEC_ID,
};

const SPEC_ARG = {
  id: SPEC_ID,
  spec: { topics: ["palm oil supply chain"] },
  scheduling: {
    version: 1,
    startDate: "2026-06-01",
    endDate: null,
    timeLocal: "07:00",
    timezone: "Asia/Kuala_Lumpur",
    cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    skipDates: [],
    skipWhen: {},
  },
};

beforeEach(() => {
  state.selectResults = [];
  state.threadInserts = [];
  state.messageInserts = [];
  state.insertError = null;
  state.insertedThread = { ...THREAD };
  breadcrumbs.length = 0;
});

describe("ensureManageThread", () => {
  it("returns the existing active bound thread without inserting", async () => {
    state.selectResults = [[{ ...THREAD }]];
    const out = await ensureManageThread({ userId: USER, spec: SPEC_ARG });
    expect(out.created).toBe(false);
    expect(out.thread.id).toBe(THREAD.id);
    expect(state.threadInserts).toHaveLength(0);
    expect(state.messageInserts).toHaveLength(0);
  });

  it("lazy-creates exactly one bound reconfigure thread + two seed bubbles", async () => {
    state.selectResults = [[]];
    const out = await ensureManageThread({ userId: USER, spec: SPEC_ARG });
    expect(out.created).toBe(true);

    expect(state.threadInserts).toHaveLength(1);
    expect(state.threadInserts[0]).toMatchObject({
      userId: USER,
      purpose: "reconfigure",
      status: "active",
      specId: SPEC_ID,
    });

    expect(state.messageInserts).toHaveLength(1);
    const rows = state.messageInserts[0]!;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ threadId: THREAD.id, role: "assistant" });
    const c0 = rows[0]!.content as { text: string; seeded: boolean };
    const c1 = rows[1]!.content as { text: string; seeded: boolean };
    expect(c0.seeded).toBe(true);
    expect(c0.text).toBe(
      "Here's your brief: palm oil supply chain, daily at 07:00 (Asia/Kuala_Lumpur)."
    );
    expect(c1.text).toBe("Ask me for a sample, or tell me what to change.");
  });

  it("unique violation → re-selects the winner + logs a Sentry breadcrumb", async () => {
    state.selectResults = [
      [], // initial lookup: nothing
      [{ ...THREAD, id: "winner-thread" }], // post-violation re-select
    ];
    state.insertError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });

    const out = await ensureManageThread({ userId: USER, spec: SPEC_ARG });
    expect(out.created).toBe(false);
    expect(out.thread.id).toBe("winner-thread");
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0]).toMatchObject({
      category: "manage-thread",
      data: { specId: SPEC_ID },
    });
    // The losing branch never seeds messages onto the winner.
    expect(state.messageInserts).toHaveLength(0);
  });

  it("rethrows when the re-select finds no winner (true failure, not a race)", async () => {
    state.selectResults = [[], []];
    state.insertError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });
    await expect(
      ensureManageThread({ userId: USER, spec: SPEC_ARG })
    ).rejects.toThrow("duplicate key value");
  });

  it("non-unique insert errors rethrow untouched, no breadcrumb", async () => {
    state.selectResults = [[]];
    state.insertError = new Error("connection reset");
    await expect(
      ensureManageThread({ userId: USER, spec: SPEC_ARG })
    ).rejects.toThrow("connection reset");
    expect(breadcrumbs).toHaveLength(0);
  });
});

describe("isUniqueViolation", () => {
  it("matches pg code, wrapped cause, and constraint-name messages", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(
      isUniqueViolation(new Error("violates chat_threads_spec_active_uq"))
    ).toBe(true);
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
