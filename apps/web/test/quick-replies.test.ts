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
import { stripQuickReplyLeak } from "@/lib/chat/sanitize";

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
    // Wave 4 Bug 4: raw enum values get prettified before render so users
    // see "Daily / Weekly / Monthly" instead of the engineer keys.
    expect(out).toEqual(["Daily", "Weekly", "Monthly"]);
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

/**
 * Wave 5 Bug 12 (P0): chip JSON must not leak into the rendered bubble body.
 * The sanitizer scrubs known leak shapes (trailing array of strings, trailing
 * array of objects, JSON-object with "chips" key, stray suggest_quick_replies
 * call) while leaving real prose untouched.
 */
describe("Wave 5 Bug 12 — stripQuickReplyLeak", () => {
  it("preserves clean prose", () => {
    const t = "How often would you like your brief?";
    expect(stripQuickReplyLeak(t)).toBe(t);
  });

  it("strips a trailing JSON-array-of-chip-strings", () => {
    const t =
      'How often? ["Daily","Weekly","Monthly"]';
    expect(stripQuickReplyLeak(t)).toBe("How often?");
  });

  it("strips a trailing JSON-object containing chips key", () => {
    const t =
      'Got it.\n{"chips":["Executive brief","Analyst deep-dive"]}';
    expect(stripQuickReplyLeak(t)).toBe("Got it.");
  });

  it("strips a trailing JSON-array of chip objects", () => {
    const t =
      'Pick a tone.\n[{"label":"Executive","value":"executive_brief"},{"label":"Analyst","value":"analyst_deep_dive"}]';
    expect(stripQuickReplyLeak(t)).toBe("Pick a tone.");
  });

  it("strips a stray suggest_quick_replies(...) call written as text", () => {
    const t =
      'Sure. suggest_quick_replies({"chips":["Daily","Weekly"]}). Anything else?';
    const out = stripQuickReplyLeak(t);
    expect(out).not.toMatch(/suggest_quick_replies/);
    expect(out).toMatch(/Sure\./);
    expect(out).toMatch(/Anything else\?/);
  });

  it("passes a topic name through (does not strip free-form short strings)", () => {
    const t = "Tell me which industry — Palm oil? Tech?";
    expect(stripQuickReplyLeak(t)).toBe(t);
  });

  it("handles empty/null defensively", () => {
    expect(stripQuickReplyLeak("")).toBe("");
    // @ts-expect-error — defensive runtime guard
    expect(stripQuickReplyLeak(null)).toBe("");
  });
});

