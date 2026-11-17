/**
 * Slice 005, review F1: a hand-written shape check on the chat messages that
 * reach `streamText`. zod 3.25.76 (GHSA-mrhx-c7xc-m3w5) builds a nested
 * union error for every bad element of `z.array(coreMessageSchema)`, so the
 * byte limit alone still let one request cost gigabytes. The check refuses
 * anything outside what the AI SDK's `useChat` sends, and caps the message
 * count and the number of elements that can reach Zod.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CHAT_MESSAGES,
  MAX_CHAT_MESSAGE_ELEMENTS,
  checkChatMessagesShape,
} from "@/server/chat/message-shape";

/** What `useChat` (ai 4.3, @ai-sdk/react 1.2) sends for a typed user turn. */
function liveUser(text: string) {
  return { role: "user", content: text, parts: [{ type: "text", text }] };
}

/** A live assistant turn: `steps` steps, each a step-start and `tools` calls, then text. */
function liveAssistant(steps: number, tools: number) {
  const parts: unknown[] = [];
  const toolInvocations: unknown[] = [];
  for (let s = 0; s < steps; s++) {
    parts.push({ type: "step-start" });
    for (let t = 0; t < tools; t++) {
      const inv = {
        state: "result",
        step: s,
        toolCallId: `call_${s}_${t}`,
        toolName: "update_spec_field",
        args: { field: "topics", value: ["palm oil"] },
        result: { ok: true },
      };
      toolInvocations.push(inv);
      parts.push({ type: "tool-invocation", toolInvocation: inv });
    }
  }
  parts.push({ type: "text", text: "Got it — anything else?" });
  return { role: "assistant", content: "Got it — anything else?", toolInvocations, parts };
}

/** A hydrated assistant turn from app/chat/page.tsx (filled with parts by useChat). */
function hydratedAssistant() {
  const inv = { state: "result", toolCallId: "c1", toolName: "send_sample", args: {}, result: { markdown: "# x" } };
  return {
    role: "assistant",
    content: "Here is a sample.",
    toolInvocations: [inv],
    parts: [
      { type: "tool-invocation", toolInvocation: inv },
      { type: "text", text: "Here is a sample." },
    ],
  };
}

const ok = { ok: true };

describe("checkChatMessagesShape: the caps", () => {
  it("pins the cap values", () => {
    expect(MAX_CHAT_MESSAGES).toBe(200);
    expect(MAX_CHAT_MESSAGE_ELEMENTS).toBe(500);
  });

  it("accepts a long legitimate thread: 200 live messages, heavy tool use", () => {
    const thread = Array.from({ length: 100 }, (_, i) => [liveUser(`turn ${i}`), liveAssistant(2, 1)]).flat();
    expect(thread).toHaveLength(200);
    expect(checkChatMessagesShape(thread)).toEqual(ok);
  });

  it("accepts the manage-mode tail at the worst tool use (20 messages, 6 steps x 3 tools)", () => {
    const tail = Array.from({ length: 10 }, (_, i) => [liveUser(`edit ${i}`), liveAssistant(6, 3)]).flat();
    expect(checkChatMessagesShape(tail)).toEqual(ok);
  });

  it("accepts hydrated history mixed with live turns, and plain string messages", () => {
    const thread = [
      { role: "user", content: "palm oil prices" },
      hydratedAssistant(),
      { role: "assistant", content: "" },
      liveUser("weekly please"),
      liveAssistant(1, 2),
    ];
    expect(checkChatMessagesShape(thread)).toEqual(ok);
  });

  it("accepts the extra fields useChat may add (data, annotations)", () => {
    expect(checkChatMessagesShape([{ ...liveUser("hi"), data: { a: 1 }, annotations: [{ x: 1 }] }])).toEqual(ok);
  });

  it("refuses more than 200 messages", () => {
    const thread = Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => ({ role: "user", content: "x" }));
    expect(checkChatMessagesShape(thread).ok).toBe(false);
    expect(checkChatMessagesShape(thread.slice(1))).toEqual(ok);
  });

  it("refuses more than 500 elements summed across the request, at the boundary", () => {
    const parts = (n: number) => Array.from({ length: n }, () => ({ type: "text", text: "a" }));
    const atCap = [
      { role: "user", content: "", parts: parts(250) },
      { role: "user", content: "", parts: parts(250) },
    ];
    expect(checkChatMessagesShape(atCap)).toEqual(ok);
    const over = [...atCap, { role: "user", content: [{ type: "text", text: "a" }] }];
    expect(checkChatMessagesShape(over).ok).toBe(false);
  });

  it("counts array content, attachments and reasoning details toward the cap", () => {
    const content = Array.from({ length: 501 }, () => ({ type: "text", text: "a" }));
    expect(checkChatMessagesShape([{ role: "user", content }]).ok).toBe(false);
    const atts = Array.from({ length: 501 }, () => ({ url: "https://example.com/a.png" }));
    expect(checkChatMessagesShape([{ role: "user", content: "x", experimental_attachments: atts }]).ok).toBe(false);
    const details = Array.from({ length: 501 }, () => ({ type: "text", text: "a" }));
    expect(
      checkChatMessagesShape([{ role: "assistant", content: "", parts: [{ type: "reasoning", details }] }]).ok
    ).toBe(false);
  });

  it("counts toolInvocations only when the message has no parts (the SDK ignores them otherwise)", () => {
    const inv = { state: "result", toolCallId: "c", toolName: "t", args: {}, result: 1 };
    const noParts = [{ role: "assistant", content: "", toolInvocations: Array.from({ length: 501 }, () => inv) }];
    expect(checkChatMessagesShape(noParts).ok).toBe(false);
  });
});

describe("checkChatMessagesShape: rejected shapes", () => {
  const bad: Array<[string, unknown]> = [
    ["messages not an array", { 0: { role: "user", content: "x" } }],
    ["a message that is not an object", [0]],
    ["a message that is null", [null]],
    ["a message that is an array", [[]]],
    ["no role", [{ content: [0, 0] }]],
    ["role system", [{ role: "system", content: "x" }]],
    ["role tool", [{ role: "tool", content: [] }]],
    ["role data", [{ role: "data", content: "x" }]],
    ["content a number", [{ role: "user", content: 0 }]],
    ["content an object", [{ role: "user", content: {} }]],
    ["array content with a number element", [{ role: "user", content: [0, 0, 0] }]],
    ["array content element without a string type", [{ role: "user", content: [{ text: "a" }] }]],
    ["array content text element without a string text", [{ role: "user", content: [{ type: "text", text: 0 }] }]],
    ["parts not an array", [{ role: "user", content: "", parts: {} }]],
    ["a part that is a number", [{ role: "user", content: "", parts: [0] }]],
    ["a part without a string type", [{ role: "user", content: "", parts: [{ type: 1 }] }]],
    ["a part of an unknown type", [{ role: "user", content: "", parts: [{ type: "bogus" }] }]],
    ["a text part without a string text", [{ role: "user", content: "", parts: [{ type: "text", text: 0 }] }]],
    ["a tool-invocation part without an invocation object", [{ role: "assistant", content: "", parts: [{ type: "tool-invocation" }] }]],
    [
      "a tool-invocation part with a non-string tool name",
      [{ role: "assistant", content: "", parts: [{ type: "tool-invocation", toolInvocation: { toolCallId: "c", toolName: 1 } }] }],
    ],
    ["a reasoning part without details", [{ role: "assistant", content: "", parts: [{ type: "reasoning" }] }]],
    [
      "a reasoning detail of the wrong shape",
      [{ role: "assistant", content: "", parts: [{ type: "reasoning", details: [{ type: "text", text: 0 }] }] }],
    ],
    ["a file part without data", [{ role: "assistant", content: "", parts: [{ type: "file", mimeType: "image/png" }] }]],
    ["toolInvocations not an array", [{ role: "assistant", content: "", toolInvocations: {} }]],
    ["a tool invocation that is a number", [{ role: "assistant", content: "", toolInvocations: [0] }]],
    ["experimental_attachments not an array", [{ role: "user", content: "x", experimental_attachments: "a" }]],
    ["an attachment without a string url", [{ role: "user", content: "x", experimental_attachments: [{}] }]],
    // providerOptions is a record of records that Zod checks key by key: one
    // element could carry thousands of bad keys under the element cap.
    ["providerOptions on a message", [{ role: "user", content: "x", providerOptions: { a: 0 } }]],
    ["experimental_providerMetadata on a message", [{ role: "user", content: "x", experimental_providerMetadata: {} }]],
    ["providerOptions on a content part", [{ role: "user", content: [{ type: "text", text: "", providerOptions: { a: 0 } }] }]],
    [
      "experimental_providerMetadata on a UI text part",
      [{ role: "assistant", content: "", parts: [{ type: "text", text: "", experimental_providerMetadata: { a: 0 } }] }],
    ],
    [
      "providerOptions on a UI file part",
      [{ role: "assistant", content: "", parts: [{ type: "file", mimeType: "a", data: "", providerOptions: {} }] }],
    ],
  ];

  it.each(bad)("refuses %s", (_name, messages) => {
    const out = checkChatMessagesShape(messages);
    expect(out.ok).toBe(false);
  });

  it("returns a short fixed reason, never the payload", () => {
    const secret = "S".repeat(10_000);
    const out = checkChatMessagesShape([{ role: "user", content: [{ type: "text", text: 0, secret }] }]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason.length).toBeLessThan(40);
      expect(out.reason).not.toContain("S");
    }
  });
});
