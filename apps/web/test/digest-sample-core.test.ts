/**
 * Brief manage mode — shared sample core (server/digest/sample.ts, plan §4.5).
 *
 * Module-boundary tests: mock db + runDigestPipeline, exercise every guard
 * branch with typed results (the core must never throw for a guard):
 *
 *   - expectedSpecId (legacy tRPC) vs specId (manage tool) branches
 *   - delivery cooldown: typed result + retryAfterMs from the NEWEST
 *     qualifying run; per-user across ALL briefs (two-brief fixture, AC2.5)
 *   - dry-run throttle (exec RC6): chat_tool within 60s → typed cooldown
 *     scope 'dry_run' BEFORE any compose; atomic-claim semantics; trpc
 *     origin exempt; deliver path unaffected
 *   - spec guards fail closed before the throttle claim is consumed
 *
 * The failed-run exclusion (`ne(status,'failed')`) lives in the moved-
 * verbatim SQL predicate — asserted structurally below alongside the
 * behavioral rows, since a chained-stub db mock cannot evaluate drizzle
 * predicates.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const state = vi.hoisted(() => ({
  /** expectedSpecId guard rows — select({id}) from digest_specs */
  currentSpecRows: [] as Array<{ id: string }>,
  /** specId guard rows — select({id,status}) from digest_specs */
  boundSpecRows: [] as Array<{ id: string; status: string }>,
  /** throttle retry lookup — select({lastSampleDryRunAt}) from users */
  userRows: [] as Array<{ lastSampleDryRunAt: Date | null }>,
  /** delivery cooldown — select({id,createdAt}) from digest_runs */
  recentRunRows: [] as Array<{ id: string; createdAt: Date }>,
  /** update(users).returning() result — [] means claim refused */
  claimRows: [] as Array<{ id: string }>,
  updateCalls: [] as Array<Record<string, unknown>>,
}));

function rowsFor(cols: Record<string, unknown>): unknown[] {
  const keys = Object.keys(cols).sort().join(",");
  if (keys === "id") return state.currentSpecRows;
  if (keys === "id,status") return state.boundSpecRows;
  if (keys === "lastSampleDryRunAt") return state.userRows;
  if (keys === "createdAt,id") return state.recentRunRows;
  throw new Error(`unexpected select shape: ${keys}`);
}

vi.mock("@/server/db/client", () => ({
  db: {
    select: (cols: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rowsFor(cols)),
          orderBy: () => ({ limit: () => Promise.resolve(rowsFor(cols)) }),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            state.updateCalls.push(vals);
            return Promise.resolve(state.claimRows);
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/server/digest/run", () => ({
  runDigestPipeline: vi.fn(async () => ({
    status: "composed_dry_run",
    digestRunId: null,
    markdown: "# sample",
    partsSent: 0,
    telegramMessageId: null,
  })),
}));

import {
  runSampleForUser,
  mapRunToResult,
  retryAfterMsFrom,
  SAMPLE_NOW_COOLDOWN_MS,
  DRY_RUN_COOLDOWN_MS,
} from "@/server/digest/sample";
import { runDigestPipeline, type RunDigestResult } from "@/server/digest/run";

const pipelineSpy = runDigestPipeline as unknown as ReturnType<typeof vi.fn>;

const USER = "u-self";
const SPEC_A = "11111111-1111-1111-1111-111111111111";
const SPEC_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  state.currentSpecRows = [];
  state.boundSpecRows = [];
  state.userRows = [];
  state.recentRunRows = [];
  state.claimRows = [{ id: USER }];
  state.updateCalls = [];
  pipelineSpy.mockClear();
});

describe("expectedSpecId branch (legacy tRPC path)", () => {
  it("composes when expectedSpecId matches the is_current spec", async () => {
    state.currentSpecRows = [{ id: SPEC_A }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "trpc",
      expectedSpecId: SPEC_A,
    });
    expect(out.ok).toBe(true);
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
    expect(pipelineSpy).toHaveBeenCalledWith({
      userId: USER,
      specId: undefined,
      dryRun: true,
      trigger: "sample",
    });
  });

  it("returns typed stale_spec on mismatch — never a throw, no compose", async () => {
    state.currentSpecRows = [{ id: SPEC_A }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "trpc",
      expectedSpecId: SPEC_B,
    });
    expect(out).toEqual({ ok: false, code: "stale_spec" });
    expect(pipelineSpy).not.toHaveBeenCalled();
  });
});

describe("specId branch (manage tool path, AC2.4)", () => {
  it("missing/unowned bound spec fails closed before compose AND before the throttle claim", async () => {
    state.boundSpecRows = [];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "chat_tool",
      specId: SPEC_A,
    });
    expect(out).toEqual({ ok: false, code: "spec_not_found" });
    expect(pipelineSpy).not.toHaveBeenCalled();
    // A refused guard must not consume the user's 60s dry-run window.
    expect(state.updateCalls).toHaveLength(0);
  });

  it("archived bound spec fails closed", async () => {
    state.boundSpecRows = [{ id: SPEC_A, status: "archived" }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "chat_tool",
      specId: SPEC_A,
    });
    expect(out).toEqual({ ok: false, code: "archived" });
    expect(pipelineSpy).not.toHaveBeenCalled();
    expect(state.updateCalls).toHaveLength(0);
  });

  it("paused bound spec is sampleable (archived-only guard) and passes specId to the pipeline", async () => {
    state.boundSpecRows = [{ id: SPEC_A, status: "paused" }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "chat_tool",
      specId: SPEC_A,
    });
    expect(out.ok).toBe(true);
    expect(pipelineSpy).toHaveBeenCalledWith({
      userId: USER,
      specId: SPEC_A,
      dryRun: true,
      trigger: "sample",
    });
  });
});

describe("dry-run throttle (exec RC6)", () => {
  it("chat_tool dry-run inside the window → typed cooldown scope dry_run BEFORE any compose", async () => {
    state.boundSpecRows = [{ id: SPEC_A, status: "active" }];
    state.claimRows = []; // atomic claim refused — inside the 60s window
    const last = new Date(Date.now() - 20_000);
    state.userRows = [{ lastSampleDryRunAt: last }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "chat_tool",
      specId: SPEC_A,
    });
    expect(out.ok).toBe(false);
    if (out.ok || out.code !== "cooldown") throw new Error("expected cooldown");
    expect(out.scope).toBe("dry_run");
    // ~40s left of the 60s window.
    expect(out.retryAfterMs).toBeGreaterThan(35_000);
    expect(out.retryAfterMs).toBeLessThanOrEqual(DRY_RUN_COOLDOWN_MS);
    expect(pipelineSpy).not.toHaveBeenCalled();
  });

  it("chat_tool dry-run with a successful claim composes (one claim per call)", async () => {
    state.boundSpecRows = [{ id: SPEC_A, status: "active" }];
    state.claimRows = [{ id: USER }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "chat_tool",
      specId: SPEC_A,
    });
    expect(out.ok).toBe(true);
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0]).toHaveProperty("lastSampleDryRunAt");
    expect(pipelineSpy).toHaveBeenCalledTimes(1);
  });

  it("trpc origin is exempt — no claim attempted (panel Preview unchanged this wave)", async () => {
    state.currentSpecRows = [{ id: SPEC_A }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "trpc",
      expectedSpecId: SPEC_A,
    });
    expect(out.ok).toBe(true);
    expect(state.updateCalls).toHaveLength(0);
  });

  it("deliver path is unaffected by the dry-run throttle (chat_tool, dryRun=false)", async () => {
    state.boundSpecRows = [{ id: SPEC_A, status: "active" }];
    state.claimRows = []; // would refuse IF consulted — it must not be
    state.recentRunRows = [];
    pipelineSpy.mockResolvedValueOnce({
      status: "delivered",
      digestRunId: "run-1",
      markdown: "ok",
      partsSent: 1,
      telegramMessageId: 1,
    });
    const out = await runSampleForUser({
      userId: USER,
      dryRun: false,
      origin: "chat_tool",
      specId: SPEC_A,
    });
    expect(out.ok).toBe(true);
    expect(state.updateCalls).toHaveLength(0);
  });
});

describe("delivery cooldown (per-user across ALL briefs)", () => {
  it("typed cooldown with retryAfterMs computed from the newest qualifying run", async () => {
    const newest = new Date(Date.now() - 2 * 60_000); // 2min ago → ~3min left
    state.recentRunRows = [{ id: "run-1", createdAt: newest }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: false,
      origin: "trpc",
    });
    expect(out.ok).toBe(false);
    if (out.ok || out.code !== "cooldown") throw new Error("expected cooldown");
    expect(out.scope).toBe("delivery");
    expect(out.retryAfterMs).toBeGreaterThan(2.5 * 60_000);
    expect(out.retryAfterMs).toBeLessThanOrEqual(3 * 60_000);
    expect(pipelineSpy).not.toHaveBeenCalled();
  });

  it("two-brief fixture (AC2.5): a run for ANY brief blocks a delivered send for brief B — same window, no spec filter", async () => {
    state.boundSpecRows = [{ id: SPEC_B, status: "active" }];
    // Newest qualifying run was brief A's panel send; the query is
    // per-user, so brief B's chat-origin send is inside the same window.
    state.recentRunRows = [{ id: "run-brief-a", createdAt: new Date() }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: false,
      origin: "chat_tool",
      specId: SPEC_B,
    });
    expect(out.ok).toBe(false);
    if (out.ok || out.code !== "cooldown") throw new Error("expected cooldown");
    expect(out.scope).toBe("delivery");
    expect(pipelineSpy).not.toHaveBeenCalled();
  });

  it("no qualifying run in the window → delivered send composes", async () => {
    state.recentRunRows = [];
    pipelineSpy.mockResolvedValueOnce({
      status: "delivered",
      digestRunId: "run-1",
      markdown: "ok",
      partsSent: 1,
      telegramMessageId: 1,
    });
    const out = await runSampleForUser({
      userId: USER,
      dryRun: false,
      origin: "trpc",
    });
    expect(out.ok).toBe(true);
    expect(pipelineSpy).toHaveBeenCalledWith({
      userId: USER,
      specId: undefined,
      dryRun: false,
      trigger: "sample",
    });
  });

  it("dry-runs skip the delivery cooldown entirely (no digest_runs query needed)", async () => {
    // recentRunRows would block IF consulted — it must not be for dry-runs.
    state.recentRunRows = [{ id: "run-1", createdAt: new Date() }];
    const out = await runSampleForUser({
      userId: USER,
      dryRun: true,
      origin: "trpc",
    });
    expect(out.ok).toBe(true);
  });

  it("failed-run exclusion is preserved in the moved-verbatim predicate (QA P1 #5)", () => {
    // A chained-stub db mock can't evaluate drizzle predicates; pin the
    // predicate structurally (same discipline as wave5-archived-spec test).
    const src = readFileSync(
      path.join(__dirname, "..", "server/digest/sample.ts"),
      "utf8"
    );
    expect(src).toMatch(/ne\(digestRuns\.status,\s*"failed"\)/);
    expect(src).toMatch(/orderBy\(desc\(digestRuns\.createdAt\)\)/);
  });
});

describe("retryAfterMsFrom — pure math", () => {
  it("computes remaining window from the claim timestamp", () => {
    const now = new Date("2026-06-12T00:05:00Z");
    const claimed = new Date("2026-06-12T00:03:00Z"); // 2min ago
    expect(retryAfterMsFrom(claimed, SAMPLE_NOW_COOLDOWN_MS, now)).toBe(3 * 60_000);
  });

  it("clamps at 0 once the window has passed", () => {
    const now = new Date("2026-06-12T00:10:00Z");
    const claimed = new Date("2026-06-12T00:00:00Z");
    expect(retryAfterMsFrom(claimed, SAMPLE_NOW_COOLDOWN_MS, now)).toBe(0);
  });
});

describe("mapRunToResult — pipeline outcome mapping", () => {
  const base = {
    digestRunId: null,
    markdown: null,
    partsSent: 0,
    telegramMessageId: null,
  };
  const run = (status: RunDigestResult["status"], markdown: string | null = null) =>
    ({ ...base, status, markdown }) as RunDigestResult;

  it("delivered / composed_dry_run → ok with markdown carried", () => {
    expect(mapRunToResult(run("delivered", "# d"))).toEqual({
      ok: true,
      run: run("delivered", "# d"),
      markdown: "# d",
    });
    expect(mapRunToResult(run("composed_dry_run", "# p")).ok).toBe(true);
  });

  it("failure statuses map to typed codes with the run attached", () => {
    expect(mapRunToResult(run("no_telegram_link"))).toMatchObject({
      ok: false,
      code: "no_telegram",
    });
    expect(mapRunToResult(run("skipped_no_credits"))).toMatchObject({
      ok: false,
      code: "no_credits",
    });
    expect(mapRunToResult(run("no_spec"))).toMatchObject({ ok: false, code: "no_spec" });
    expect(mapRunToResult(run("duplicate"))).toMatchObject({ ok: false, code: "duplicate" });
    expect(mapRunToResult(run("failed"))).toMatchObject({ ok: false, code: "failed" });
  });
});
