/**
 * Brief manage mode — deterministic manage eval suite (plan §4.4, CI).
 *
 * Descriptor replay against the MANAGE registry with stubbed
 * `updateSpec`/`sendSample` — no LLM, no DB. The manage twin of
 * test/config-agent.eval.test.ts:
 *
 *   - Fixtures 1–5 (edit golden set, test/fixtures/config-agent/
 *     manage-fixtures.ts): session draft seeded from the SAVED spec via
 *     specToDraft (mirrors the route's hydration), edits staged, then
 *     `save_changes` must hand the stub the SAME bound spec id and the
 *     exact merged snapshot; version comes back +1; draft clears.
 *     The cadence-changed signal (what updateSpecInPlace keys its
 *     scheduling recompute on) is asserted per fixture.
 *   - Fixture 6: invalid edit (empties topics) → finalizeDraft rejects at
 *     save, NO stub call, staged draft survives for repair (AC3.3/AC3.4).
 *   - Fixture 7: `save_changes` without user_confirmed → throws; with no
 *     draft → throws (the defended gate, exec "nothing saved" blast radius).
 *   - Fixture 8: `send_sample(deliver:false)` → stub receives
 *     {dryRun:true, specId:bound}; delivery-cooldown stub result surfaces
 *     as typed {ok:false, code:'cooldown'} — never a throw (AC2.2).
 *   - Fixture 9: dry-run throttle stub result surfaces untouched —
 *     {ok:false, code:'cooldown', scope:'dry_run'} (exec RC6).
 *   - Registry guard: manageAgentTools exposes EXACTLY its 6 keys
 *     (mirrors the setup eval's byte-frozen guard).
 *
 * Threshold = all pass. Model-quality eval lives in the opt-in live suite
 * (test/eval-manage-live.test.ts) because it costs money and is
 * non-deterministic.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { manageAgentTools } from "@/server/ai/config-agent/tools";
import { specToDraft } from "@/server/ai/config-agent/manage-context";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import type { SampleResult } from "@/server/digest/sample";
import {
  manageFixtures,
  SAVED_SPEC,
  SAVED_VERSION,
  type ManageToolCall,
} from "./fixtures/config-agent/manage-fixtures";

const BOUND_SPEC = "22222222-2222-2222-2222-222222222222";

function makeManageCtx(opts?: {
  seedDraft?: boolean;
  sampleResult?: SampleResult;
}): {
  ctx: ConfigAgentContext;
  session: ConfigAgentSession;
  updateSpecCalls: Array<{ userId: string; specId: string; spec: DigestSpecV1 }>;
  sendSampleCalls: Array<{ dryRun: boolean; specId: string }>;
} {
  const updateSpecCalls: Array<{
    userId: string;
    specId: string;
    spec: DigestSpecV1;
  }> = [];
  const sendSampleCalls: Array<{ dryRun: boolean; specId: string }> = [];
  const session: ConfigAgentSession = {
    userId: "eval-user",
    threadId: "eval-manage-thread",
    boundSpecId: BOUND_SPEC,
    // Route parity (route.ts manage hydration): no staged edits on the
    // thread ⇒ the working draft seeds from the SAVED spec.
    draft: opts?.seedDraft === false ? undefined : specToDraft(SAVED_SPEC),
  };
  const ctx: ConfigAgentContext = {
    session,
    saveSpec: async () => {
      throw new Error(
        "confirm_and_save's saveSpec must be unreachable from the manage registry"
      );
    },
    updateSpec: async (args) => {
      updateSpecCalls.push(args);
      return { id: args.specId, version: SAVED_VERSION + 1 };
    },
    sendSample: async (args) => {
      sendSampleCalls.push(args);
      return (
        opts?.sampleResult ?? {
          ok: true,
          run: { status: "composed_dry_run" } as never,
          markdown: "# Today's brief\n\nPalm oil steady.",
        }
      );
    },
  };
  return { ctx, session, updateSpecCalls, sendSampleCalls };
}

async function runCall(
  call: ManageToolCall,
  ctx: ConfigAgentContext
): Promise<unknown> {
  const tool = manageAgentTools[call.tool];
  const parsed = tool.schema.safeParse(call.args);
  if (!parsed.success) {
    throw new Error(
      `fixture call to ${call.tool} has invalid args: ${parsed.error.message}`
    );
  }
  return tool.handler(parsed.data as never, ctx);
}

describe("manage eval harness — edit golden set (fixtures 1–5)", () => {
  for (const fixture of manageFixtures) {
    it(`${fixture.id}: ${fixture.description}`, async () => {
      const { ctx, session, updateSpecCalls } = makeManageCtx();

      for (const call of fixture.calls) {
        await runCall(call, ctx);
      }

      // Exactly one in-place save, targeting the SAME bound spec id.
      expect(updateSpecCalls, "save_changes applies exactly once").toHaveLength(1);
      const applied = updateSpecCalls[0]!;
      expect(applied.specId).toBe(BOUND_SPEC);
      expect(applied.userId).toBe("eval-user");

      // (1) strict Zod parse — the merged spec is well-formed.
      const parsed = digestSpecSchema.safeParse(applied.spec);
      expect(
        parsed.success,
        parsed.success ? "" : JSON.stringify(parsed.error.format())
      ).toBe(true);

      // (2) exact merged snapshot (saved spec + staged delta, nothing else).
      expect(applied.spec).toEqual(fixture.expected);

      // (3) scheduling-recompute signal: updateSpecInPlace recomputes
      // scheduling/next_run_at iff the cadence JSON changed (unit-locked in
      // test/update-spec-in-place.test.ts) — pin which side each edit is on.
      const cadenceChanged =
        JSON.stringify(SAVED_SPEC.cadence) !==
        JSON.stringify(applied.spec.cadence);
      expect(cadenceChanged).toBe(fixture.expectScheduleRecompute);

      // (4) version bump + session bookkeeping (savedSpecId stamped for the
      // backfill invariant; draft cleared so the rail resets to baseline).
      expect(session.savedSpecId).toBe(BOUND_SPEC);
      expect(session.draft).toBeUndefined();
    });
  }
});

describe("fixture 6 — invalid edit (empties topics)", () => {
  it("rejected at STAGING by the draft schema: no stub call, draft stays at the saved baseline (AC3.3)", async () => {
    // Stronger than the plan assumed: the draft schema itself requires ≥1
    // topic, so emptying topics throws inside update_spec_field (production:
    // safeExecute envelope → the agent explains and re-asks) before
    // finalizeDraft is ever reached.
    const { ctx, session, updateSpecCalls } = makeManageCtx();

    await expect(
      runCall(
        { tool: "update_spec_field", args: { path: "topics", value: [] } },
        ctx
      )
    ).rejects.toThrow(/at least 1/);

    expect(updateSpecCalls).toHaveLength(0);
    // The failed staging mutated nothing — draft is still the saved baseline.
    expect(session.draft).toEqual(specToDraft(SAVED_SPEC));

    // A confirmed save now applies the UNCHANGED baseline (no partial write
    // of the rejected edit) — the live brief can never absorb the bad value.
    await runCall({ tool: "save_changes", args: { user_confirmed: true } }, ctx);
    expect(updateSpecCalls).toHaveLength(1);
    expect(updateSpecCalls[0]!.spec.topics).toEqual(SAVED_SPEC.topics);
  });

  it("incomplete draft (degraded hydration) → finalizeDraft rejects at save, NO write (AC3.3/AC3.4)", async () => {
    // The finalizeDraft-level gate the plan named: a draft that is valid as
    // a DRAFT but incomplete as a strict spec (the route's defensive
    // specToDraft degrades malformed jsonb to an empty draft).
    const { ctx, session, updateSpecCalls } = makeManageCtx({
      seedDraft: false,
    });
    await runCall(
      {
        tool: "update_spec_field",
        args: { path: "tone_preset", value: "executive_brief" },
      },
      ctx
    );

    await expect(
      runCall({ tool: "save_changes", args: { user_confirmed: true } }, ctx)
    ).rejects.toThrow(/cannot save/);

    expect(updateSpecCalls).toHaveLength(0);
    expect(session.savedSpecId).toBeUndefined();
    // The staged draft survives so the user can fix it conversationally.
    expect(session.draft).toBeDefined();
  });
});

describe("fixture 7 — the defended save gate", () => {
  it("save_changes without user_confirmed throws; no write", async () => {
    const { ctx, updateSpecCalls } = makeManageCtx();
    await expect(
      runCall({ tool: "save_changes", args: { user_confirmed: false } }, ctx)
    ).rejects.toThrow(/user_confirmed/);
    expect(updateSpecCalls).toHaveLength(0);
  });

  it("save_changes with no draft throws; no write", async () => {
    const { ctx, updateSpecCalls } = makeManageCtx({ seedDraft: false });
    await expect(
      runCall({ tool: "save_changes", args: { user_confirmed: true } }, ctx)
    ).rejects.toThrow(/no staged changes/);
    expect(updateSpecCalls).toHaveLength(0);
  });
});

describe("fixture 8 — send_sample plumbing", () => {
  it("deliver:false → stub called {dryRun:true, specId:bound}, markdown surfaced", async () => {
    const { ctx, sendSampleCalls } = makeManageCtx();
    const out = await manageAgentTools.send_sample.handler(
      { deliver: false },
      ctx
    );
    expect(sendSampleCalls).toEqual([{ dryRun: true, specId: BOUND_SPEC }]);
    expect(out).toEqual({
      ok: true,
      deliver: false,
      markdown: "# Today's brief\n\nPalm oil steady.",
    });
  });

  it("delivery-cooldown stub result surfaces as typed {ok:false, code:'cooldown'} — never a throw", async () => {
    const { ctx } = makeManageCtx({
      sampleResult: {
        ok: false,
        code: "cooldown",
        scope: "delivery",
        retryAfterMs: 4 * 60_000,
      },
    });
    const out = await manageAgentTools.send_sample.handler(
      { deliver: true },
      ctx
    );
    expect(out).toEqual({
      ok: false,
      code: "cooldown",
      scope: "delivery",
      retryAfterMs: 240_000,
      retryAfterMinutes: 4,
    });
  });
});

describe("fixture 9 — dry-run throttle result (exec RC6)", () => {
  it("{ok:false, code:'cooldown', scope:'dry_run'} surfaces untouched — the model layer never sees a throw", async () => {
    const { ctx } = makeManageCtx({
      sampleResult: {
        ok: false,
        code: "cooldown",
        scope: "dry_run",
        retryAfterMs: 45_000,
      },
    });
    const out = await manageAgentTools.send_sample.handler(
      { deliver: false },
      ctx
    );
    expect(out).toEqual({
      ok: false,
      code: "cooldown",
      scope: "dry_run",
      retryAfterMs: 45_000,
      retryAfterMinutes: 1,
    });
  });
});

describe("registry guard (mirrors the setup eval's)", () => {
  it("exposes exactly the 6 manage tools", () => {
    expect(Object.keys(manageAgentTools).sort()).toEqual([
      "ask_user",
      "propose_spec",
      "save_changes",
      "send_sample",
      "suggest_quick_replies",
      "update_spec_field",
    ]);
  });
});
