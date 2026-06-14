/**
 * Brief manage mode — manage registry guard + send_sample / save_changes
 * handlers (plan §4.3.2/§4.3.3, §4.4 registry assertion, §6 unit rows).
 *
 * REGISTRY GUARDS (the do-not-regress pair):
 *   - manageAgentTools exposes EXACTLY its 6 keys — no confirm_and_save
 *     (manage saves are cap-free in-place updates) and no add_rss_feed
 *     (RSS out of scope this wave; prompt scope fence owns the ask, RC3).
 *   - configAgentTools stays EXACTLY its 6 keys (mirrors the setup eval's
 *     guard so a manage-side edit can't silently widen setup).
 *
 * Handlers run against stub contexts (no DB, no LLM) — the same injection
 * seam the deterministic eval suite (chunk D) replays through.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  configAgentTools,
  manageAgentTools,
} from "@/server/ai/config-agent/tools";
import { send_sample } from "@/server/ai/config-agent/tools/send_sample";
import { save_changes } from "@/server/ai/config-agent/tools/save_changes";
import {
  loadManageAgentSystemPrompt,
  loadConfigAgentSystemPrompt,
} from "@/server/ai/config-agent/system-prompt";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import type { SampleResult } from "@/server/digest/sample";
import { log } from "@/lib/log";

const BOUND_SPEC = "11111111-1111-1111-1111-111111111111";

const VALID_DRAFT = {
  schema_version: 1 as const,
  topics: ["palm oil supply chain"],
  cadence: {
    frequency: "daily" as const,
    delivery_time_local: "08:00",
    days_of_week: [1, 2, 3, 4, 5],
  },
};

function makeCtx(opts: {
  boundSpecId?: string;
  draft?: typeof VALID_DRAFT;
  sampleResult?: SampleResult;
  withSendSample?: boolean;
  withUpdateSpec?: boolean;
}) {
  const session: ConfigAgentSession = {
    userId: "u-self",
    threadId: "t-1",
    boundSpecId: opts.boundSpecId,
    draft: opts.draft,
  };
  const sendSampleCalls: Array<{ dryRun: boolean; specId: string }> = [];
  const updateSpecCalls: Array<Record<string, unknown>> = [];
  const ctx: ConfigAgentContext = {
    session,
    saveSpec: async () => {
      throw new Error("setup saveSpec must never be reached from manage tools");
    },
    ...(opts.withSendSample === false
      ? {}
      : {
          sendSample: async (args: { dryRun: boolean; specId: string }) => {
            sendSampleCalls.push(args);
            return (
              opts.sampleResult ?? {
                ok: true,
                run: { status: "composed_dry_run" } as never,
                markdown: "# sample",
              }
            );
          },
        }),
    ...(opts.withUpdateSpec === false
      ? {}
      : {
          updateSpec: async (args: {
            userId: string;
            specId: string;
            spec: unknown;
          }) => {
            updateSpecCalls.push(args as Record<string, unknown>);
            return { id: args.specId, version: 5 };
          },
        }),
  };
  return { ctx, session, sendSampleCalls, updateSpecCalls };
}

beforeEach(() => {
  (log.info as ReturnType<typeof vi.fn>).mockClear();
});

describe("tool registries (do-not-regress guards)", () => {
  it("manage registry exposes EXACTLY the 6 manage tools (plan §4.3.2)", () => {
    expect(Object.keys(manageAgentTools).sort()).toEqual([
      "ask_user",
      "propose_spec",
      "save_changes",
      "send_sample",
      "suggest_quick_replies",
      "update_spec_field",
    ]);
  });

  it("setup registry stays EXACTLY the 6 setup tools — byte-frozen", () => {
    expect(Object.keys(configAgentTools).sort()).toEqual([
      "add_rss_feed",
      "ask_user",
      "confirm_and_save",
      "propose_spec",
      "suggest_quick_replies",
      "update_spec_field",
    ]);
  });

  it("manage reuses the SAME descriptor objects for the shared tools", () => {
    expect(manageAgentTools.propose_spec).toBe(configAgentTools.propose_spec);
    expect(manageAgentTools.update_spec_field).toBe(
      configAgentTools.update_spec_field
    );
    expect(manageAgentTools.ask_user).toBe(configAgentTools.ask_user);
    expect(manageAgentTools.suggest_quick_replies).toBe(
      configAgentTools.suggest_quick_replies
    );
  });
});

describe("prompt loaders", () => {
  it("manage prompt loads from its own file and is not the setup prompt", () => {
    const manage = loadManageAgentSystemPrompt();
    const setup = loadConfigAgentSystemPrompt();
    expect(manage).toContain("Manage Agent");
    expect(manage).toContain("save_changes");
    expect(manage).not.toContain("confirm_and_save(");
    expect(manage).not.toBe(setup);
    // Setup prompt byte-untouched is locked by its own eval; sanity here.
    expect(setup).toContain("Config Agent — System Prompt v1");
  });
});

describe("send_sample handler", () => {
  it("dry-run: calls the core with {dryRun:true, specId:bound}, returns markdown", async () => {
    const { ctx, sendSampleCalls } = makeCtx({ boundSpecId: BOUND_SPEC });
    const out = await send_sample.handler({ deliver: false }, ctx);
    expect(sendSampleCalls).toEqual([{ dryRun: true, specId: BOUND_SPEC }]);
    expect(out).toEqual({ ok: true, deliver: false, markdown: "# sample" });
  });

  it("deliver: calls the core with {dryRun:false}, confirms delivery, no markdown card", async () => {
    const { ctx, sendSampleCalls } = makeCtx({
      boundSpecId: BOUND_SPEC,
      sampleResult: {
        ok: true,
        run: { status: "delivered" } as never,
        markdown: "# delivered body",
      },
    });
    const out = await send_sample.handler({ deliver: true }, ctx);
    expect(sendSampleCalls).toEqual([{ dryRun: false, specId: BOUND_SPEC }]);
    expect(out).toEqual({ ok: true, deliver: true, delivered: true });
  });

  it("delivery cooldown surfaces untouched + retryAfterMinutes enrichment (AC2.2)", async () => {
    const { ctx } = makeCtx({
      boundSpecId: BOUND_SPEC,
      sampleResult: {
        ok: false,
        code: "cooldown",
        scope: "delivery",
        retryAfterMs: 4 * 60_000 + 1,
      },
    });
    const out = await send_sample.handler({ deliver: true }, ctx);
    expect(out).toEqual({
      ok: false,
      code: "cooldown",
      scope: "delivery",
      retryAfterMs: 240_001,
      retryAfterMinutes: 5,
    });
  });

  it("dry-run throttle result surfaces untouched — never a throw (exec RC6)", async () => {
    const { ctx } = makeCtx({
      boundSpecId: BOUND_SPEC,
      sampleResult: {
        ok: false,
        code: "cooldown",
        scope: "dry_run",
        retryAfterMs: 30_000,
      },
    });
    const out = await send_sample.handler({ deliver: false }, ctx);
    expect(out).toMatchObject({
      ok: false,
      code: "cooldown",
      scope: "dry_run",
      retryAfterMinutes: 1,
    });
  });

  it("strips pipeline run internals from failure results", async () => {
    const { ctx } = makeCtx({
      boundSpecId: BOUND_SPEC,
      sampleResult: {
        ok: false,
        code: "no_telegram",
        run: { status: "no_telegram_link", secret: "internal" } as never,
      },
    });
    const out = await send_sample.handler({ deliver: true }, ctx);
    expect(out).toEqual({ ok: false, code: "no_telegram" });
  });

  it("fires sample_requested always and sample_blocked with the ACX.5 reason vocabulary", async () => {
    const { ctx } = makeCtx({
      boundSpecId: BOUND_SPEC,
      sampleResult: {
        ok: false,
        code: "cooldown",
        scope: "dry_run",
        retryAfterMs: 10_000,
      },
    });
    await send_sample.handler({ deliver: false }, ctx);
    const info = log.info as ReturnType<typeof vi.fn>;
    const events = info.mock.calls.map((c) => [c[0], c[1]]);
    expect(events.some(([e]) => e === "sample_requested")).toBe(true);
    const blocked = events.find(([e]) => e === "sample_blocked");
    expect(blocked?.[1]).toMatchObject({
      via: "chat_tool",
      reason: "dry_run_cooldown",
    });
  });

  it("throws (→ recoverable envelope) without a bound spec or injected core", async () => {
    const noBind = makeCtx({});
    await expect(
      send_sample.handler({ deliver: false }, noBind.ctx)
    ).rejects.toThrow(/not linked to a saved brief/);

    const noCore = makeCtx({ boundSpecId: BOUND_SPEC, withSendSample: false });
    await expect(
      send_sample.handler({ deliver: false }, noCore.ctx)
    ).rejects.toThrow(/not available/);
  });
});

describe("save_changes handler", () => {
  it("defended gate: user_confirmed must be true (fixture 7a)", async () => {
    const { ctx, updateSpecCalls } = makeCtx({
      boundSpecId: BOUND_SPEC,
      draft: VALID_DRAFT,
    });
    await expect(
      save_changes.handler({ user_confirmed: false }, ctx)
    ).rejects.toThrow(/user_confirmed/);
    expect(updateSpecCalls).toHaveLength(0);
  });

  it("defended gate: a draft must exist (fixture 7b)", async () => {
    const { ctx, updateSpecCalls } = makeCtx({ boundSpecId: BOUND_SPEC });
    await expect(
      save_changes.handler({ user_confirmed: true }, ctx)
    ).rejects.toThrow(/no staged changes/);
    expect(updateSpecCalls).toHaveLength(0);
  });

  it("applies via updateSpec(same bound id), stamps savedSpecId, clears the draft (AC3.1)", async () => {
    const { ctx, session, updateSpecCalls } = makeCtx({
      boundSpecId: BOUND_SPEC,
      draft: VALID_DRAFT,
    });
    const out = await save_changes.handler({ user_confirmed: true }, ctx);

    expect(updateSpecCalls).toHaveLength(1);
    expect(updateSpecCalls[0]).toMatchObject({
      userId: "u-self",
      specId: BOUND_SPEC,
    });
    // finalizeDraft promoted the draft to a strict spec (defaults filled).
    const sentSpec = updateSpecCalls[0]!.spec as { topics: string[] };
    expect(sentSpec.topics).toEqual(["palm oil supply chain"]);

    // Same result shape as confirm_and_save so the client scan reuses it.
    expect(out).toEqual({ ok: true, spec_id: BOUND_SPEC, version: 5 });
    expect(session.savedSpecId).toBe(BOUND_SPEC);
    expect(session.draft).toBeUndefined();
  });

  it("invalid resulting spec → finalizeDraft rejects, NO write (AC3.3)", async () => {
    const { ctx, session, updateSpecCalls } = makeCtx({
      boundSpecId: BOUND_SPEC,
      draft: { ...VALID_DRAFT, topics: [] },
    });
    await expect(
      save_changes.handler({ user_confirmed: true }, ctx)
    ).rejects.toThrow(/cannot save/);
    expect(updateSpecCalls).toHaveLength(0);
    expect(session.savedSpecId).toBeUndefined();
    // The staged draft survives for the user to fix (AC3.4 posture).
    expect(session.draft).toBeDefined();
  });

  it("throws without a bound spec or injected updater", async () => {
    const noBind = makeCtx({ draft: VALID_DRAFT });
    await expect(
      save_changes.handler({ user_confirmed: true }, noBind.ctx)
    ).rejects.toThrow(/not linked to a saved brief/);

    const noUpdater = makeCtx({
      boundSpecId: BOUND_SPEC,
      draft: VALID_DRAFT,
      withUpdateSpec: false,
    });
    await expect(
      save_changes.handler({ user_confirmed: true }, noUpdater.ctx)
    ).rejects.toThrow(/not available/);
  });
});
