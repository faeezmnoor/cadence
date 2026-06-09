/**
 * Regression coverage for chat-client's chip-source selector.
 *
 * Dogfood 2026-06-09: chips disappeared from brief-creation chat because
 * the config-agent often skips `suggest_quick_replies` despite the system
 * prompt rule. Selector now falls back to `ask_user.suggestions` so the
 * user is never left chip-less.
 *
 * Single-source-of-truth invariant preserved: `suggest_quick_replies` wins
 * when both tools fire on the same turn (no dual-strip regression).
 */
import { describe, expect, it } from "vitest";
import type { Message } from "ai";
import { pickLatestQuickReplies } from "@/components/chat/quick-replies";

type ToolInvocation = NonNullable<Message["toolInvocations"]>[number];

function assistantTurn(invocations: ToolInvocation[]): Message {
  return {
    id: `a-${Math.random()}`,
    role: "assistant",
    content: "",
    toolInvocations: invocations,
  };
}

function userTurn(text: string): Message {
  return { id: `u-${Math.random()}`, role: "user", content: text };
}

function sqr(chips: unknown): ToolInvocation {
  return {
    toolCallId: "tc-sqr",
    toolName: "suggest_quick_replies",
    state: "result",
    args: { chips },
    result: { ok: true, chips },
  } as unknown as ToolInvocation;
}

function askUser(question: string, suggestions?: unknown): ToolInvocation {
  return {
    toolCallId: "tc-ask",
    toolName: "ask_user",
    state: "result",
    args: { question, suggestions },
    result: { ok: true, question, suggestions: suggestions ?? [] },
  } as unknown as ToolInvocation;
}

describe("pickLatestQuickReplies", () => {
  it("returns suggest_quick_replies.chips when present", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([sqr(["every day", "weekdays"])]),
    ]);
    expect(out).toEqual(["every day", "weekdays"]);
  });

  it("falls back to ask_user.suggestions when suggest_quick_replies is absent (Bug 2 fix)", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([askUser("How often?", ["daily", "weekly", "monthly"])]),
    ]);
    expect(out).toEqual(["daily", "weekly", "monthly"]);
  });

  it("prefers suggest_quick_replies when both tools fire on the same turn (no dual-source)", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([
        askUser("How often?", ["daily", "weekly"]),
        sqr(["every day", "weekdays", "Mon Wed Fri"]),
      ]),
    ]);
    expect(out).toEqual(["every day", "weekdays", "Mon Wed Fri"]);
  });

  it("returns [] when the latest message is a user turn (already answered)", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([sqr(["every day", "weekdays"])]),
      userTurn("every day"),
    ]);
    expect(out).toEqual([]);
  });

  it("returns [] when assistant turn has no relevant tool calls", () => {
    const out = pickLatestQuickReplies([assistantTurn([])]);
    expect(out).toEqual([]);
  });

  it("caps at 4 chips", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([sqr(["a", "b", "c", "d", "e", "f"])]),
    ]);
    expect(out).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores non-string chips defensively", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([sqr(["a", 2, null, "b"])]),
    ]);
    expect(out).toEqual(["a", "b"]);
  });

  it("returns [] when ask_user has empty suggestions and no suggest_quick_replies", () => {
    const out = pickLatestQuickReplies([
      assistantTurn([askUser("Topic?", [])]),
    ]);
    expect(out).toEqual([]);
  });
});
