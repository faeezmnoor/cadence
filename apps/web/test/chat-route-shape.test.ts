/**
 * Slice 005, review F1: /api/chat runs the hand-written message shape check
 * (server/chat/message-shape.ts) after the body guard and before anything
 * reaches `streamText`, in both modes, and before any write. The check runs
 * on the messages the route forwards: the whole thread in setup mode, the
 * capped tail (capManageTranscript) in manage mode, so a long manage thread
 * is never refused. The catch block logs a capped error message.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } } }));
vi.mock("@/server/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/server/rate-limit/check", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const state = vi.hoisted(() => ({ manage: false }));
vi.mock("@/lib/feature-flags", async (orig) => ({
  ...(await orig<typeof import("@/lib/feature-flags")>()),
  isManageMode: () => state.manage,
}));

const insert = vi.fn(() => ({ values: vi.fn(async () => undefined) }));
const update = vi.fn(() => ({ set: () => ({ where: vi.fn(async () => undefined) }) }));
vi.mock("@/server/db/client", async () => {
  const schema = await import("@/server/db/schema");
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === schema.digestSpecs
                ? [{ id: "spec-1", status: "active", name: "Palm oil", version: 1, spec: {} }]
                : [
                    {
                      id: "thread-1",
                      userId: "user-1",
                      status: "active",
                      specId: state.manage ? "spec-1" : null,
                      draftSpec: null,
                      templateId: null,
                    },
                  ],
          }),
        }),
      }),
      insert,
      update,
    },
  };
});
vi.mock("@/server/ai/config-agent/runtime", () => ({ buildAiSdkTools: () => ({}) }));
vi.mock("@/server/ai/config-agent/manage-context", () => ({
  buildManageContextBlock: () => "CURRENT BRIEF",
  specToDraft: () => undefined,
}));

const streamText = vi.fn((_opts: { messages: unknown[] }) => ({
  toDataStreamResponse: () => new Response("streamed"),
}));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  streamText: (opts: { messages: unknown[] }) => streamText(opts),
}));
const logError = vi.fn();
vi.mock("@/lib/log", () => ({
  log: { error: (...a: unknown[]) => logError(...a), info: vi.fn(), warn: vi.fn() },
}));

const { POST } = await import("@/app/api/chat/route");

afterEach(() => {
  vi.clearAllMocks();
  state.manage = false;
});

function post(messages: unknown) {
  return POST(
    new Request("https://app.example.com/api/chat", {
      method: "POST",
      body: JSON.stringify({ threadId: "thread-1", messages }),
    })
  );
}

/** Last message from the assistant: the route goes straight to streamText (no writes, no extractor). */
const legit = [
  { role: "user", content: "palm oil", parts: [{ type: "text", text: "palm oil" }] },
  { role: "assistant", content: "Daily or weekly?", parts: [{ type: "text", text: "Daily or weekly?" }] },
];

describe("/api/chat message shape check", () => {
  it("passes a legitimate thread to streamText unchanged", async () => {
    const res = await post(legit);
    expect(res.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(streamText.mock.calls[0][0].messages).toEqual(legit);
  });

  it.each([
    ["a bad content array (setup)", [{ role: "user", content: [0, 0, 0] }]],
    ["no role", [{ content: [0, 0] }]],
    ["a text part with a number", [{ role: "assistant", content: "", parts: [{ type: "text", text: 0 }] }]],
    ["201 messages", Array.from({ length: 201 }, () => ({ role: "assistant", content: "x" }))],
  ])("refuses %s with a 400 before any write or streamText", async (_n, messages) => {
    const res = await post(messages);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad request" });
    expect(streamText).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a bad shape in manage mode too", async () => {
    state.manage = true;
    const res = await post([{ role: "assistant", content: [{ type: "x" }, 0] }]);
    expect(res.status).toBe(400);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("accepts a manage thread longer than 200 messages (only the forwarded tail is capped)", async () => {
    state.manage = true;
    const thread = Array.from({ length: 300 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `m${i}`,
    }));
    thread[thread.length - 1] = { role: "assistant", content: "last" };
    const res = await post(thread);
    expect(res.status).toBe(200);
    expect(streamText.mock.calls[0][0].messages).toHaveLength(20);
  });

  it("logs a capped message, never the full error, when streamText throws", async () => {
    streamText.mockImplementationOnce(() => {
      throw new Error("Validation error: " + "x".repeat(1_000_000));
    });
    const res = await post(legit);
    expect(res.status).toBe(500);
    const fields = logError.mock.calls.find((c) => c[0] === "chat stream failed")?.[1] as { err: string };
    expect(fields.err.length).toBeLessThanOrEqual(500);
  });
});
