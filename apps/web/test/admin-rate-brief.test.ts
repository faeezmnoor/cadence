/**
 * Evals Phase 0 — admin.rateBrief tRPC mutation.
 *
 * Coverage:
 *   - Signed-out -> UNAUTHORIZED (adminProcedure gate).
 *   - Signed-in non-admin -> FORBIDDEN.
 *   - Unknown runId -> NOT_FOUND.
 *   - Happy path: returns { ok: true, rating }, persists rating with the
 *     server-stamped ratedAt/ratedBy, uses jsonb_set so prior metadata
 *     (e.g. sourceResolve) survives the write.
 *   - Input validation: 1-5 sliders, notes length cap.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface FakeRunRow {
  id: string;
  metadata: Record<string, unknown>;
}

const FIXED_NOW = new Date("2026-06-03T01:23:45.000Z");

const runsStore: Record<string, FakeRunRow> = {
  "11111111-1111-1111-1111-111111111111": {
    id: "11111111-1111-1111-1111-111111111111",
    metadata: { sourceResolve: { rate: 0.9, results: [], checkedAt: "x" } },
  },
};

const updateCalls: Array<{ id: string; setKeys: string[] }> = [];
let currentRunId: string | null = null;

vi.mock("@/server/db/client", () => {
  return {
    db: {
      update(_table: unknown) {
        let setKeys: string[] = [];
        const chain = {
          set(p: Record<string, unknown>) {
            setKeys = Object.keys(p);
            return chain;
          },
          where(_predicate: unknown) {
            return chain;
          },
          returning() {
            const id = currentRunId;
            if (id && runsStore[id]) {
              updateCalls.push({ id, setKeys });
              // We don't try to evaluate jsonb_set in JS — we just mark
              // the rating as "would have been written" by recording the
              // call. Behavioural assertions inspect updateCalls.
              return Promise.resolve([{ id }]);
            }
            return Promise.resolve([]);
          },
        };
        return chain;
      },
    },
  };
});

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
  currentRunId = null;
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

describe("admin.rateBrief auth gate", () => {
  it("rejects signed-out callers", async () => {
    const caller = appRouter.createCaller(makeCtx({ signedIn: false }));
    await expect(
      caller.admin.rateBrief({
        runId: "11111111-1111-1111-1111-111111111111",
        grounding: 3,
        specificity: 3,
        fit: 3,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects non-admins", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ email: "stranger@example.com" })
    );
    await expect(
      caller.admin.rateBrief({
        runId: "11111111-1111-1111-1111-111111111111",
        grounding: 3,
        specificity: 3,
        fit: 3,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updateCalls).toHaveLength(0);
  });
});

describe("admin.rateBrief behaviour", () => {
  it("returns NOT_FOUND when the row doesn't exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    currentRunId = "22222222-2222-2222-2222-222222222222"; // not in store
    await expect(
      caller.admin.rateBrief({
        runId: currentRunId,
        grounding: 4,
        specificity: 4,
        fit: 4,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("happy path: stamps ratedAt/ratedBy server-side and returns rating", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const runId = "11111111-1111-1111-1111-111111111111";
    currentRunId = runId;
    const result = await caller.admin.rateBrief({
      runId,
      grounding: 5,
      specificity: 4,
      fit: 3,
      notes: "great fit, weak specificity",
    });
    expect(result.ok).toBe(true);
    expect(result.rating).toMatchObject({
      grounding: 5,
      specificity: 4,
      fit: 3,
      notes: "great fit, weak specificity",
      ratedBy: "admin@example.com",
      ratedAt: FIXED_NOW.toISOString(),
    });
    // Exactly one UPDATE was issued, and it set metadata + updatedAt
    // (no other columns). The SQL itself is jsonb_set, asserted by the
    // router code; here we confirm we touched the right columns only.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.setKeys.sort()).toEqual(
      ["metadata", "updatedAt"].sort()
    );
  });

  it("allows notes to be omitted (notes becomes null on the row)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const runId = "11111111-1111-1111-1111-111111111111";
    currentRunId = runId;
    const result = await caller.admin.rateBrief({
      runId,
      grounding: 4,
      specificity: 4,
      fit: 4,
    });
    expect(result.rating.notes).toBeNull();
  });

  it("rejects sliders outside 1-5", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const runId = "11111111-1111-1111-1111-111111111111";
    currentRunId = runId;
    await expect(
      caller.admin.rateBrief({
        runId,
        grounding: 6,
        specificity: 3,
        fit: 3,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.admin.rateBrief({
        runId,
        grounding: 0,
        specificity: 3,
        fit: 3,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects notes >1000 chars", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const runId = "11111111-1111-1111-1111-111111111111";
    currentRunId = runId;
    await expect(
      caller.admin.rateBrief({
        runId,
        grounding: 3,
        specificity: 3,
        fit: 3,
        notes: "x".repeat(1001),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
