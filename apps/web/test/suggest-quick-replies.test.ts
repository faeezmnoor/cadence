/**
 * T-414 / CAD-74: smoke test for the suggest_quick_replies tool descriptor.
 *
 * Verifies:
 *  - schema rejects 0 chips, accepts 1-4, rejects 5+
 *  - schema rejects chips > 20 chars
 *  - handler is a pure pass-through (no session mutation)
 */
import { describe, expect, it, vi } from "vitest";
import { configAgentTools } from "@/server/ai/config-agent/tools";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";

function makeCtx(): ConfigAgentContext {
  const session: ConfigAgentSession = {
    userId: "11111111-1111-1111-1111-111111111111",
    threadId: "22222222-2222-2222-2222-222222222222",
  };
  return { session, saveSpec: vi.fn() };
}

describe("suggest_quick_replies", () => {
  const tool = configAgentTools.suggest_quick_replies;

  it("accepts 2-4 short chips", () => {
    expect(
      tool.schema.safeParse({ chips: ["every day", "weekdays"] }).success
    ).toBe(true);
    expect(
      tool.schema.safeParse({
        chips: ["a", "b", "c", "d"],
      }).success
    ).toBe(true);
  });

  it("rejects 0 chips", () => {
    expect(tool.schema.safeParse({ chips: [] }).success).toBe(false);
  });

  it("rejects more than 4 chips", () => {
    expect(
      tool.schema.safeParse({ chips: ["a", "b", "c", "d", "e"] }).success
    ).toBe(false);
  });

  it("rejects chips longer than 20 chars", () => {
    expect(
      tool.schema.safeParse({
        chips: ["this is way too long to be a chip"],
      }).success
    ).toBe(false);
  });

  it("handler is a pass-through and does not mutate session", async () => {
    const ctx = makeCtx();
    const before = JSON.stringify(ctx.session);
    const result = await tool.handler({ chips: ["a", "b"] }, ctx);
    expect(result).toEqual({ ok: true, chips: ["a", "b"] });
    expect(JSON.stringify(ctx.session)).toBe(before);
  });
});
