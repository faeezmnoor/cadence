/**
 * briefs.* router tests — multi-brief Phase A 2b coverage.
 *
 * We mock @/server/db/client to expose a small in-memory store and
 * record set/where keys; the goal is behavioural coverage of the auth
 * gate, the soft-cap, the status transitions, and the preview helper.
 *
 * Note: we don't try to execute drizzle's SQL — we mirror the chain
 * shape (select/from/where/orderBy/limit, update/set/where/returning,
 * insert is unused here) just enough to satisfy the router's callers.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SchedulingRuleV1 } from "@/lib/scheduling/rule";

interface SpecRow {
  id: string;
  userId: string;
  name: string;
  status: "active" | "paused" | "archived" | "superseded";
  scheduling: unknown;
  tier: string;
  nextRunAt: Date | null;
  pausedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const FIXED_NOW = new Date("2026-06-05T03:00:00.000Z");

let specStore: SpecRow[] = [];
let updateCalls: Array<{ setKeys: string[]; targetId?: string }> = [];

/**
 * Tiny chainable mock that records what was set / where-d and resolves
 * select/update calls against `specStore`. Filters are simulated by a
 * filter function attached via `where` — drizzle's `and(eq(...))` produces
 * an opaque value, so we drive the filter via globals the test sets.
 */
let currentSelectFilter: ((r: SpecRow) => boolean) | null = null;
let currentUpdateFilter: ((r: SpecRow) => boolean) | null = null;
let nextSelectColumns: string[] = [];

vi.mock("@/server/db/client", () => {
  return {
    db: {
      select(cols?: Record<string, unknown>) {
        nextSelectColumns = cols ? Object.keys(cols) : [];
        const chain = {
          from(_table: unknown) {
            return chain;
          },
          innerJoin(_t: unknown, _c: unknown) {
            return chain;
          },
          where(_predicate: unknown) {
            return chain;
          },
          orderBy(_c: unknown) {
            return chain;
          },
          limit(_n: number) {
            return chain;
          },
          then(resolve: (v: unknown[]) => unknown) {
            const filter = currentSelectFilter ?? (() => true);
            const rows = specStore.filter(filter).map((r) => {
              if (nextSelectColumns.length === 0) return r;
              const out: Record<string, unknown> = {};
              for (const k of nextSelectColumns) out[k] = (r as unknown as Record<string, unknown>)[k];
              return out;
            });
            return Promise.resolve(rows).then(resolve);
          },
        };
        return chain;
      },
      update(_table: unknown) {
        let setPayload: Record<string, unknown> = {};
        const chain = {
          set(p: Record<string, unknown>) {
            setPayload = p;
            return chain;
          },
          where(_predicate: unknown) {
            return chain;
          },
          returning(_cols?: Record<string, unknown>) {
            const filter = currentUpdateFilter ?? (() => false);
            const matched = specStore.filter(filter);
            for (const m of matched) {
              Object.assign(m, setPayload);
            }
            updateCalls.push({
              setKeys: Object.keys(setPayload),
              targetId: matched[0]?.id,
            });
            return Promise.resolve(matched.map((m) => ({ id: m.id })));
          },
        };
        return chain;
      },
    },
  };
});

import { appRouter } from "@/server/trpc/root";

function makeCtx(userId = "u-self") {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    supabase: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

function sampleRule(overrides: Partial<SchedulingRuleV1> = {}): SchedulingRuleV1 {
  return {
    version: 1,
    startDate: "2026-06-01",
    endDate: null,
    timeLocal: "08:00",
    timezone: "Asia/Kuala_Lumpur",
    cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    skipDates: [],
    skipWhen: {},
    ...overrides,
  } as SchedulingRuleV1;
}

beforeEach(() => {
  specStore = [];
  updateCalls = [];
  currentSelectFilter = null;
  currentUpdateFilter = null;
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

describe("briefs.list", () => {
  it("rejects signed-out callers", async () => {
    const caller = appRouter.createCaller({ user: null, supabase: null } as never);
    await expect(caller.briefs.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns empty array when user has no briefs", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.list();
    expect(result).toEqual([]);
  });

  it("returns active+paused briefs; lastRun is null when no runs", async () => {
    specStore.push({
      id: "11111111-1111-1111-1111-111111111111",
      userId: "u-self",
      name: "Palm oil weekly",
      status: "active",
      scheduling: sampleRule(),
      tier: "default",
      nextRunAt: new Date("2026-06-06T00:00:00Z"),
      pausedAt: null,
      archivedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    currentSelectFilter = (r) =>
      r.userId === "u-self" && (r.status === "active" || r.status === "paused");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.list();
    expect(result).toHaveLength(1);
    expect(result[0]!.lastRun).toBeNull();
  });
});

describe("briefs.pause / resume / archive", () => {
  beforeEach(() => {
    specStore.push({
      id: "11111111-1111-1111-1111-111111111111",
      userId: "u-self",
      name: "Palm oil weekly",
      status: "active",
      scheduling: sampleRule(),
      tier: "default",
      nextRunAt: new Date("2026-06-06T00:00:00Z"),
      pausedAt: null,
      archivedAt: null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  });

  it("pause flips status, sets pausedAt, clears nextRunAt", async () => {
    currentUpdateFilter = (r) =>
      r.id === "11111111-1111-1111-1111-111111111111" && r.userId === "u-self" && (r.status === "active" || r.status === "paused");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.pause({ id: "11111111-1111-1111-1111-111111111111" });
    expect(result).toEqual({ ok: true, id: "11111111-1111-1111-1111-111111111111" });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.setKeys.sort()).toEqual(["nextRunAt", "pausedAt", "status", "updatedAt"]);
  });

  it("pause NOT_FOUND when wrong user", async () => {
    currentUpdateFilter = () => false; // simulate ownership miss
    const caller = appRouter.createCaller(makeCtx("u-other"));
    await expect(caller.briefs.pause({ id: "11111111-1111-1111-1111-111111111111" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("resume re-validates scheduling + recomputes nextRunAt", async () => {
    specStore[0]!.status = "paused";
    currentSelectFilter = (r) => r.id === "11111111-1111-1111-1111-111111111111" && r.userId === "u-self";
    currentUpdateFilter = (r) => r.id === "11111111-1111-1111-1111-111111111111" && r.userId === "u-self";
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.resume({ id: "11111111-1111-1111-1111-111111111111" });
    expect(result.ok).toBe(true);
    // nextRunAt should be a real Date strictly after FIXED_NOW.
    expect(result.nextRunAt).toBeInstanceOf(Date);
    expect(result.nextRunAt!.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("resume rejects archived briefs", async () => {
    specStore[0]!.status = "archived";
    currentSelectFilter = (r) => r.id === "11111111-1111-1111-1111-111111111111" && r.userId === "u-self";
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.briefs.resume({ id: "11111111-1111-1111-1111-111111111111" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("archive flips status, sets archivedAt, clears nextRunAt, flips isCurrent=false (Wave 5 Bug 10)", async () => {
    currentUpdateFilter = (r) =>
      r.id === "11111111-1111-1111-1111-111111111111" && r.userId === "u-self" && (r.status === "active" || r.status === "paused");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.archive({ id: "11111111-1111-1111-1111-111111111111" });
    expect(result).toEqual({ ok: true, id: "11111111-1111-1111-1111-111111111111" });
    // Wave 5 Bug 10: isCurrent MUST be flipped to false so the legacy
    // single-brief delivery + RSS paths (which still gate on
    // is_current=true) don't keep the archived spec in rotation.
    expect(updateCalls[0]!.setKeys.sort()).toEqual(
      ["archivedAt", "isCurrent", "nextRunAt", "status", "updatedAt"]
    );
  });
});

describe("briefs.preview", () => {
  it("returns 5 occurrences for a daily rule", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.preview({
      rule: sampleRule(),
      count: 5,
    });
    expect(result.occurrences).toHaveLength(5);
    // Strictly increasing.
    for (let i = 1; i < result.occurrences.length; i++) {
      expect(result.occurrences[i]!.getTime()).toBeGreaterThan(
        result.occurrences[i - 1]!.getTime()
      );
    }
  });

  it("rejects malformed rules with BAD_REQUEST", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.briefs.preview({ rule: { version: 1 }, count: 5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("caps count at 10", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.briefs.preview({ rule: sampleRule(), count: 50 })
    ).rejects.toThrow();
  });
});

describe("briefs.canCreate (CAD-212 brief cap: 1 per user, founder 2)", () => {
  function pushBrief(i: number, status: "active" | "paused" | "archived" = "active") {
    specStore.push({
      id: `0000000${i}-0000-0000-0000-000000000000`,
      userId: "u-self",
      name: `b${i}`,
      status,
      scheduling: sampleRule(),
      tier: "default",
      nextRunAt: null,
      pausedAt: null,
      archivedAt: status === "archived" ? FIXED_NOW : null,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  }

  it("allows the first brief (0 non-archived)", async () => {
    currentSelectFilter = (r) =>
      r.userId === "u-self" && (r.status === "active" || r.status === "paused");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.canCreate();
    expect(result).toEqual({ allowed: true, count: 0, max: 1 });
  });

  it("blocks at 1 brief for a non-admin; archived rows don't count", async () => {
    pushBrief(0, "active");
    pushBrief(9, "archived");
    currentSelectFilter = (r) =>
      r.userId === "u-self" && (r.status === "active" || r.status === "paused");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.canCreate();
    expect(result).toEqual({ allowed: false, count: 1, max: 1 });
  });

  it("paused briefs still count toward the cap", async () => {
    pushBrief(0, "paused");
    currentSelectFilter = (r) =>
      r.userId === "u-self" && (r.status === "active" || r.status === "paused");
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.briefs.canCreate();
    expect(result).toEqual({ allowed: false, count: 1, max: 1 });
  });

  it("founder (admin email allowlist) is exempt at 2", async () => {
    vi.stubEnv("CADENCE_ADMIN_EMAILS", "founder@cadence.news");
    try {
      pushBrief(0, "active");
      currentSelectFilter = (r) =>
        r.userId === "u-self" && (r.status === "active" || r.status === "paused");
      const caller = appRouter.createCaller({
        user: { id: "u-self", email: "founder@cadence.news" },
        supabase: null,
      } as never);
      const one = await caller.briefs.canCreate();
      expect(one).toEqual({ allowed: true, count: 1, max: 2 });

      pushBrief(1, "active");
      const two = await caller.briefs.canCreate();
      expect(two).toEqual({ allowed: false, count: 2, max: 2 });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
