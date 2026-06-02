/**
 * T-111: Config-agent eval harness.
 *
 * For each fixture we replay the tool-call sequence directly against the
 * descriptor handlers (no LLM in the loop) with a stub `saveSpec`, then
 * assert the final captured spec:
 *   1. parses against the strict DigestSpec Zod schema, and
 *   2. matches the fixture's expected snapshot.
 *
 * This catches regressions in: descriptor input validation, draft merge
 * semantics, path-based updates, and the confirm-and-save Zod gate.
 *
 * Model-quality eval (does Claude actually produce these tool calls from
 * NL input?) is intentionally NOT in this suite — that's a separate
 * opt-in run because it costs money and is non-deterministic.
 */
import { describe, expect, it } from "vitest";
import { configAgentTools } from "@/server/ai/config-agent/tools";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";
import type { ConfigAgentContext, ConfigAgentSession } from "@/server/ai/config-agent/types";
import { fixtures, type ToolCall } from "./fixtures/config-agent/fixtures";

function makeCtx(): { ctx: ConfigAgentContext; saved: DigestSpecV1[] } {
  const saved: DigestSpecV1[] = [];
  const session: ConfigAgentSession = {
    userId: "test-user",
    threadId: "test-thread",
  };
  const ctx: ConfigAgentContext = {
    session,
    saveSpec: async ({ spec }) => {
      saved.push(spec);
      return { id: `test-spec-${saved.length}`, version: saved.length };
    },
  };
  return { ctx, saved };
}

async function runCall(call: ToolCall, ctx: ConfigAgentContext): Promise<void> {
  const tool = configAgentTools[call.tool];
  const parsed = tool.schema.safeParse(call.args);
  if (!parsed.success) {
    throw new Error(`fixture call to ${call.tool} has invalid args: ${parsed.error.message}`);
  }
  await tool.handler(parsed.data as never, ctx);
}

describe("config-agent eval harness", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: ${fixture.description}`, async () => {
      const { ctx, saved } = makeCtx();

      for (const call of fixture.calls) {
        await runCall(call, ctx);
      }

      expect(saved.length, "confirm_and_save should produce exactly one save").toBe(1);
      const result = saved[0]!;

      // (1) strict Zod parse — final spec is well-formed
      const parsed = digestSpecSchema.safeParse(result);
      expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.format())).toBe(true);

      // (2) snapshot match against expected shape
      expect(result).toEqual(fixture.expected);
    });
  }

  it("exposes exactly 6 tools", () => {
    expect(Object.keys(configAgentTools).sort()).toEqual([
      "add_rss_feed",
      "ask_user",
      "confirm_and_save",
      "propose_spec",
      "suggest_quick_replies",
      "update_spec_field",
    ]);
  });
});
