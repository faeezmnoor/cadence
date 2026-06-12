/**
 * Brief manage mode — digest.sampleNow thin-wrapper contract (plan §4.5).
 *
 * The router is now a wrapper over server/digest/sample.ts. These tests
 * LOCK the exact TRPCError codes AND messages the brief-actions client
 * string-matches on (components/chat/brief-actions.tsx tests
 * /many requests|few minutes/i), so the extraction can never drift them.
 * Mock at the module boundary: stub the shared core, exercise the router.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SampleResult } from "@/server/digest/sample";

const core = vi.hoisted(() => ({
  result: { ok: true } as unknown as SampleResult,
  calls: [] as unknown[],
}));

const logMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/digest/sample", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/digest/sample")>();
  return {
    ...actual,
    runSampleForUser: vi.fn(async (args: unknown) => {
      core.calls.push(args);
      return core.result;
    }),
  };
});

vi.mock("@/lib/log", () => ({ log: logMock }));

import { appRouter } from "@/server/trpc/root";

function makeCtx() {
  return {
    user: { id: "u-self", email: "x@y.z" },
    headers: new Headers(),
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

const DELIVERED = {
  status: "delivered",
  digestRunId: "run-1",
  markdown: "ok",
  partsSent: 1,
  telegramMessageId: 1,
};

beforeEach(() => {
  core.calls = [];
  core.result = { ok: true, run: DELIVERED, markdown: "ok" } as SampleResult;
  logMock.info.mockClear();
});

describe("digest.sampleNow — thin wrapper over runSampleForUser", () => {
  it("passes origin 'trpc' (dry-run throttle exempt) and forwards inputs", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.digest.sampleNow({ dryRun: true, expectedSpecId: "11111111-1111-1111-1111-111111111111" });
    expect(core.calls).toEqual([
      {
        userId: "u-self",
        dryRun: true,
        origin: "trpc",
        expectedSpecId: "11111111-1111-1111-1111-111111111111",
      },
    ]);
  });

  it("returns the raw RunDigestResult on success (client branches on run.status)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const out = await caller.digest.sampleNow({ dryRun: false });
    expect(out).toEqual(DELIVERED);
  });

  it("cooldown → TOO_MANY_REQUESTS with the EXACT legacy message", async () => {
    core.result = {
      ok: false,
      code: "cooldown",
      scope: "delivery",
      retryAfterMs: 120_000,
    };
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.digest.sampleNow({ dryRun: false })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "You just sent a brief. Try again in a few minutes.",
    });
  });

  it("stale_spec → PRECONDITION_FAILED with the EXACT legacy message", async () => {
    core.result = { ok: false, code: "stale_spec" };
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.digest.sampleNow({
        dryRun: true,
        expectedSpecId: "22222222-2222-2222-2222-222222222222",
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Your spec hasn't been saved yet. Confirm it in chat first, then try again.",
    });
  });

  it("ACX.5 (exec CPO#1): logs sample_requested {via:'panel_button'} with the tool's field shape", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.digest.sampleNow({
      dryRun: true,
      expectedSpecId: "11111111-1111-1111-1111-111111111111",
    });
    expect(logMock.info).toHaveBeenCalledWith("sample_requested", {
      userId: "u-self",
      specId: "11111111-1111-1111-1111-111111111111",
      via: "panel_button",
      dry_run: true,
    });
    // Success path: no blocked event.
    const blocked = logMock.info.mock.calls.filter(
      (c) => c[0] === "sample_blocked"
    );
    expect(blocked).toHaveLength(0);
  });

  it("ACX.5 (exec CPO#1): logs sample_blocked with the shared reason vocabulary on cooldown", async () => {
    core.result = {
      ok: false,
      code: "cooldown",
      scope: "delivery",
      retryAfterMs: 120_000,
    };
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.digest.sampleNow({ dryRun: false })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(logMock.info).toHaveBeenCalledWith("sample_blocked", {
      userId: "u-self",
      specId: null,
      via: "panel_button",
      dry_run: false,
      reason: "cooldown",
    });
  });

  it("pipeline failure outcomes pass through as the raw run (legacy contract)", async () => {
    const noLink = {
      status: "no_telegram_link",
      digestRunId: null,
      markdown: "# composed",
      partsSent: 0,
      telegramMessageId: null,
    };
    core.result = { ok: false, code: "no_telegram", run: noLink } as SampleResult;
    const caller = appRouter.createCaller(makeCtx());
    const out = await caller.digest.sampleNow({ dryRun: false });
    expect(out).toEqual(noLink);
  });
});
