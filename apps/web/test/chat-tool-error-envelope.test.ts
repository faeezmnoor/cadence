/**
 * T-409 / CAD-71 regression: tool handler throws must become recoverable
 * tool-result envelopes when invoked through the AI SDK bridge, not bubble
 * out as exceptions that kill the chat stream.
 *
 * We assert the bridge layer (`buildAiSdkTools` → `safeExecute`), not the
 * raw descriptor handlers — the descriptors are still allowed to throw.
 * The contract that matters is what the model SEES.
 */
import { describe, expect, it, vi } from "vitest";
import { buildAiSdkTools } from "@/server/ai/config-agent/runtime";
import { isToolErrorEnvelope } from "@/server/ai/config-agent/safe-execute";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";

function makeCtx() {
  const session: ConfigAgentSession = {
    userId: "11111111-1111-1111-1111-111111111111",
    threadId: "22222222-2222-2222-2222-222222222222",
  };
  const saveSpec = vi.fn().mockResolvedValue({ id: "spec-1", version: 1 });
  const ctx: ConfigAgentContext = { session, saveSpec };
  return { ctx, session, saveSpec };
}

describe("AI SDK tool bridge: recoverable error envelopes", () => {
  it("confirm_and_save with no draft returns ok:false instead of throwing", async () => {
    const { ctx } = makeCtx();
    const tools = buildAiSdkTools(ctx);
    const result = await tools.confirm_and_save.execute(
      { user_confirmed: true },
      { messages: [], toolCallId: "tc-1" }
    );
    expect(isToolErrorEnvelope(result)).toBe(true);
    expect((result as { error: string }).error).toMatch(/no draft to save/i);
  });

  it("update_spec_field with an unknown top-level key returns recoverable error", async () => {
    const { ctx } = makeCtx();
    const tools = buildAiSdkTools(ctx);
    const result = await tools.update_spec_field.execute(
      { path: "not_a_real_field", value: "anything" },
      { messages: [], toolCallId: "tc-2" }
    );
    expect(isToolErrorEnvelope(result)).toBe(true);
    expect((result as { recoverable: boolean }).recoverable).toBe(true);
  });

  it("add_rss_feed with an SSRF host returns recoverable error, draft untouched", async () => {
    const { ctx, session } = makeCtx();
    const tools = buildAiSdkTools(ctx);
    const result = await tools.add_rss_feed.execute(
      { url: "http://127.0.0.1/feed", label: "evil" },
      { messages: [], toolCallId: "tc-3" }
    );
    expect(isToolErrorEnvelope(result)).toBe(true);
    expect(session.draft).toBeUndefined();
  });

  it("happy path still returns the underlying success result unchanged", async () => {
    const { ctx } = makeCtx();
    const tools = buildAiSdkTools(ctx);
    const result = await tools.ask_user.execute(
      { question: "What industry?", suggestions: ["fintech", "agri"] },
      { messages: [], toolCallId: "tc-4" }
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    expect((result as { question: string }).question).toBe("What industry?");
  });
});
