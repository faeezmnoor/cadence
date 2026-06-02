/**
 * T-305 (CAD-40): admin.replayRun behavioural contract.
 *
 * Coverage:
 *   - Signed-out caller -> UNAUTHORIZED (the adminProcedure gate).
 *   - Signed-in non-admin -> FORBIDDEN.
 *   - Admin + unknown runId -> NOT_FOUND, no update + no event published.
 *   - Admin + valid runId -> in-place reset (attempt_count=0, last_error=null,
 *     error=null, status='pending') AND a `digest/run.scheduled` event
 *     carrying `replay: true`.
 *   - Replay does NOT INSERT a new digest_runs row (idempotency for the
 *     normal cron-dispatch path is unaffected — we only ever update).
 *
 * The DB is a thin in-memory stub so we can assert the exact SET payload
 * and confirm `insert` is never touched on this path. Inngest's `send` is
 * a vi.fn — we only care about the published event shape, not its delivery.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface FakeRun {
  id: string;
  userId: string;
  specId: string;
  runDate: string;
  deliveryMinuteUtc: Date | null;
  status: string;
  attemptCount: number;
  lastError: string | null;
  error: string | null;
  updatedAt: Date;
}

const FIXED_NOW = new Date("2026-06-02T12:34:56.000Z");

const runsStore: Record<string, FakeRun> = {
  "11111111-1111-1111-1111-111111111111": {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "user-a",
    specId: "spec-a",
    runDate: "2026-06-02",
    deliveryMinuteUtc: new Date("2026-06-02T00:30:00Z"),
    status: "failed",
    attemptCount: 3,
    lastError: "503 upstream",
    error: "telegram 503",
    updatedAt: new Date("2026-06-02T00:35:00Z"),
  },
};

const updateCalls: Array<{ id: string; set: Partial<FakeRun> }> = [];
const insertCalls: unknown[] = [];

vi.mock("@/server/db/client", () => {
  return {
    db: {
      select() {
        // Used by listRuns AND by replayRun's existence probe. We only
        // care about the latter — it filters by digestRuns.id.
        let whereId: string | null = null;
        const chain = {
          from() {
            return chain;
          },
          innerJoin() {
            return chain;
          },
          where(_predicate: unknown) {
            // Drizzle's eq() result is opaque; we extract the row id by
            // pulling it out of the most recent runId argument that
            // replayRun passed. Since the procedure threads input.runId
            // straight into eq(digestRuns.id, runId), we peek the global.
            whereId = currentReplayRunId;
            return chain;
          },
          orderBy() {
            return chain;
          },
          limit(_n: number) {
            if (whereId && runsStore[whereId]) {
              const r = runsStore[whereId]!;
              return Promise.resolve([
                {
                  id: r.id,
                  userId: r.userId,
                  specId: r.specId,
                  runDate: r.runDate,
                  deliveryMinuteUtc: r.deliveryMinuteUtc,
                },
              ]);
            }
            return Promise.resolve([]);
          },
        };
        return chain;
      },
      update(_table: unknown) {
        let setPayload: Partial<FakeRun> = {};
        const chain = {
          set(p: Partial<FakeRun>) {
            setPayload = p;
            return chain;
          },
          where(_predicate: unknown) {
            // Same trick: the procedure builds eq(digestRuns.id, row.id).
            const id = currentReplayRunId;
            if (id && runsStore[id]) {
              Object.assign(runsStore[id]!, setPayload);
              updateCalls.push({ id, set: setPayload });
            }
            return Promise.resolve();
          },
        };
        return chain;
      },
      insert(_table: unknown) {
        insertCalls.push(_table);
        return {
          values() {
            return this;
          },
          returning() {
            return this;
          },
          onConflictDoNothing() {
            return Promise.resolve([]);
          },
        };
      },
    },
  };
});

// vi.mock factories are hoisted above all `const` declarations, so we use
// vi.hoisted() to lift the mock fn into the same hoisted region.
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/server/inngest/client", () => ({
  inngest: { send: sendMock },
}));

// Threaded into the mocks because the input runId is the only stable handle
// we have on which row the procedure is targeting in this test process.
let currentReplayRunId: string | null = null;

import { appRouter } from "@/server/trpc/root";

function makeCtx(overrides: { email?: string | null; signedIn?: boolean } = {}) {
  const signedIn = overrides.signedIn ?? true;
  return {
    user: signedIn
      ? { id: "u-self", email: overrides.email ?? "admin@example.com" }
      : null,
    supabase: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

beforeEach(() => {
  process.env.CADENCE_ADMIN_EMAILS = "admin@example.com";
  updateCalls.length = 0;
  insertCalls.length = 0;
  sendMock.mockClear();
  currentReplayRunId = null;
  // Reset the stored row to a "failed, attempts exhausted" baseline.
  runsStore["11111111-1111-1111-1111-111111111111"] = {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "user-a",
    specId: "spec-a",
    runDate: "2026-06-02",
    deliveryMinuteUtc: new Date("2026-06-02T00:30:00Z"),
    status: "failed",
    attemptCount: 3,
    lastError: "503 upstream",
    error: "telegram 503",
    updatedAt: new Date("2026-06-02T00:35:00Z"),
  };
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

describe("admin.replayRun gate", () => {
  it("rejects signed-out callers with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeCtx({ signedIn: false }));
    currentReplayRunId = "11111111-1111-1111-1111-111111111111";
    await expect(
      caller.admin.replayRun({ runId: currentReplayRunId })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(updateCalls).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects signed-in non-admin with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ email: "stranger@example.com" })
    );
    currentReplayRunId = "11111111-1111-1111-1111-111111111111";
    await expect(
      caller.admin.replayRun({ runId: currentReplayRunId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateCalls).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unknown runId and does not dispatch", async () => {
    const caller = appRouter.createCaller(makeCtx());
    currentReplayRunId = "22222222-2222-2222-2222-222222222222";
    await expect(
      caller.admin.replayRun({ runId: currentReplayRunId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateCalls).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("admin.replayRun behaviour", () => {
  it("resets the row in-place and emits a replay event", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const runId = "11111111-1111-1111-1111-111111111111";
    currentReplayRunId = runId;

    const result = await caller.admin.replayRun({ runId });
    expect(result).toEqual({ ok: true, runId });

    // In-place reset semantics — the same row id, with the failure
    // diagnostics cleared and status back to 'pending'.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.id).toBe(runId);
    expect(updateCalls[0]!.set).toMatchObject({
      status: "pending",
      attemptCount: 0,
      lastError: null,
      error: null,
    });
    expect(updateCalls[0]!.set.updatedAt).toEqual(FIXED_NOW);

    // The stored row should reflect the reset (history lost — by design).
    const after = runsStore[runId]!;
    expect(after.status).toBe("pending");
    expect(after.attemptCount).toBe(0);
    expect(after.lastError).toBeNull();
    expect(after.error).toBeNull();

    // Re-dispatched via direct event publish, carrying replay: true so
    // logs / handlers can tell replays apart from cron fires.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      name: "digest/run.scheduled",
      data: {
        userId: "user-a",
        digestRunId: runId,
        runDate: "2026-06-02",
        deliveryMinuteUtc: "2026-06-02T00:30:00.000Z",
        replay: true,
      },
    });
  });

  it("does NOT insert a new digest_runs row (idempotency intact)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const runId = "11111111-1111-1111-1111-111111111111";
    currentReplayRunId = runId;

    await caller.admin.replayRun({ runId });

    // The cron dispatcher's UNIQUE-partial-index claim path must remain
    // the only INSERT into digest_runs. Replay rides update-in-place.
    expect(insertCalls).toHaveLength(0);
  });
});
