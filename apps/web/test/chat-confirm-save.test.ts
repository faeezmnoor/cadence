/**
 * Chat E2E (descriptor-level) — propose_spec -> confirm_and_save.
 *
 * Covers the zod-fix symptom path: the LLM proposes a draft DigestSpec,
 * then calls confirm_and_save, which finalizes the draft against
 * `digestSpecSchema` and writes via the injected saveSpec side-effect.
 *
 * We exercise the real tool descriptors + real draft helpers + real Zod
 * schema. saveSpec is mocked so we don't touch the DB; tRPC mutation
 * behaviour is covered by `digestSpecRouter.updateRaw` which shares the
 * same code path (see save-spec.ts vs router/digestSpec.ts comment).
 *
 * Bypassing the LLM is deliberate — mocking the model would test the
 * wiring, not the symptom. The symptom was schema validation, which is
 * what we exercise here.
 */
import { describe, expect, it, vi } from "vitest";
import { configAgentTools } from "@/server/ai/config-agent/tools";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import { DIGEST_SPEC_SCHEMA_VERSION } from "@/lib/digest-spec/schema";

function makeCtx(saveSpec = vi.fn().mockResolvedValue({ id: "spec-1", version: 1 })) {
  const session: ConfigAgentSession = {
    userId: "11111111-1111-1111-1111-111111111111",
    threadId: "22222222-2222-2222-2222-222222222222",
  };
  const ctx: ConfigAgentContext = { session, saveSpec };
  return { ctx, session, saveSpec };
}

const validProposal = {
  schema_version: DIGEST_SPEC_SCHEMA_VERSION,
  topics: ["chicken industry", "feed pricing"],
  cadence: {
    frequency: "daily" as const,
    delivery_time_local: "08:00",
    days_of_week: [1, 2, 3, 4, 5],
  },
  language: "en" as const,
};

describe("chat E2E: propose_spec -> confirm_and_save", () => {
  it("propose_spec stores a valid draft on the session", async () => {
    const { ctx, session } = makeCtx();
    const result = (await configAgentTools.propose_spec.handler(
      { spec: validProposal },
      ctx
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(session.draft).toBeDefined();
    expect(session.draft?.topics).toEqual(["chicken industry", "feed pricing"]);
    expect(session.draft?.cadence?.frequency).toBe("daily");
  });

  it("confirm_and_save without prior propose_spec errors clearly", async () => {
    const { ctx } = makeCtx();
    await expect(
      configAgentTools.confirm_and_save.handler({ user_confirmed: true }, ctx)
    ).rejects.toThrow(/no draft to save/i);
  });

  it("confirm_and_save with user_confirmed=false errors clearly", async () => {
    const { ctx } = makeCtx();
    await configAgentTools.propose_spec.handler({ spec: validProposal }, ctx);
    await expect(
      configAgentTools.confirm_and_save.handler({ user_confirmed: false }, ctx)
    ).rejects.toThrow(/user_confirmed must be true/i);
  });

  it("end-to-end: propose -> confirm calls saveSpec with finalized spec", async () => {
    const { ctx, session, saveSpec } = makeCtx();
    await configAgentTools.propose_spec.handler({ spec: validProposal }, ctx);
    const result = (await configAgentTools.confirm_and_save.handler(
      { user_confirmed: true },
      ctx
    )) as { ok: boolean; spec_id: string; version: number };

    expect(result.ok).toBe(true);
    expect(result.spec_id).toBe("spec-1");
    expect(saveSpec).toHaveBeenCalledTimes(1);

    const call = saveSpec.mock.calls[0]![0] as {
      userId: string;
      spec: { topics: string[]; schema_version: number; cadence: { frequency: string } };
    };
    expect(call.userId).toBe(session.userId);
    expect(call.spec.schema_version).toBe(DIGEST_SPEC_SCHEMA_VERSION);
    expect(call.spec.topics).toEqual(["chicken industry", "feed pricing"]);
    // finalizeDraft must fill defaults (data_addons, tone, length, entities)
    expect(call.spec).toMatchObject({
      tone_preset: "executive_brief",
      length_target: "short",
      language: "en",
    });
    expect(session.savedSpecId).toBe("spec-1");
  });

  it("relays the CAD-212 brief-gate notice when saveSpec returns one", async () => {
    const notice =
      "You have one brief already — multiple briefs are coming soon. " +
      "This chat updates your existing brief instead.";
    const { ctx } = makeCtx(
      vi.fn().mockResolvedValue({ id: "spec-1", version: 2, notice })
    );
    await configAgentTools.propose_spec.handler({ spec: validProposal }, ctx);
    const result = (await configAgentTools.confirm_and_save.handler(
      { user_confirmed: true },
      ctx
    )) as { ok: boolean; notice?: string };
    expect(result.ok).toBe(true);
    expect(result.notice).toBe(notice);
  });

  it("omits notice when saveSpec returns none", async () => {
    const { ctx } = makeCtx();
    await configAgentTools.propose_spec.handler({ spec: validProposal }, ctx);
    const result = (await configAgentTools.confirm_and_save.handler(
      { user_confirmed: true },
      ctx
    )) as Record<string, unknown>;
    expect("notice" in result).toBe(false);
  });

  it("rejects an incomplete draft at confirm-time (no topics)", async () => {
    const { ctx } = makeCtx();
    // Propose a draft without topics, then try to save. propose_spec accepts
    // partial drafts; finalizeDraft enforces the strict schema.
    await configAgentTools.propose_spec.handler(
      {
        spec: {
          schema_version: DIGEST_SPEC_SCHEMA_VERSION,
          cadence: validProposal.cadence,
        },
      },
      ctx
    );
    await expect(
      configAgentTools.confirm_and_save.handler({ user_confirmed: true }, ctx)
    ).rejects.toThrow(/topics/i);
  });

  it("rejects a malformed proposal at propose-time (bad time format)", async () => {
    const { ctx } = makeCtx();
    await expect(
      configAgentTools.propose_spec.handler(
        {
          spec: {
            ...validProposal,
            cadence: { ...validProposal.cadence, delivery_time_local: "25:99" },
          },
        },
        ctx
      )
    ).rejects.toThrow();
  });
});
