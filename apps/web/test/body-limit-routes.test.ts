/**
 * Slice 005: the two HTTP entry points that hand caller-controlled input to
 * Zod sit behind `withBodyLimit`.
 *   - /api/trpc/[trpc]: every procedure's `.input()` (e.g. briefs.preview →
 *     schedulingRuleV1).
 *   - /api/chat: `streamText` validates `body.messages` with
 *     `z.array(coreMessageSchema)` (ai 4.x standardizePrompt).
 * An over-limit body gets 413 before the tRPC handler or the chat auth step
 * runs; an under-limit body reaches them unchanged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_REQUEST_BODY_BYTES } from "@/server/http/body-limit";

const fetchRequestHandler = vi.fn(async ({ req }: { req: Request }) =>
  Response.json({ echoed: await req.text() })
);
vi.mock("@trpc/server/adapters/fetch", () => ({ fetchRequestHandler }));
vi.mock("@/server/trpc/root", () => ({ appRouter: {} }));
vi.mock("@/server/trpc/context", () => ({ createTRPCContext: vi.fn() }));

const getUser = vi.fn(async () => ({ data: { user: { id: "user-1" } } }));
const createSupabaseServerClient = vi.fn(async () => ({ auth: { getUser } }));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/server/rate-limit/check", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
// Thread lookup finds nothing → 404, which proves the body was parsed.
const limit = vi.fn(async () => []);
vi.mock("@/server/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) },
}));

const trpcRoute = await import("@/app/api/trpc/[trpc]/route");
const chatRoute = await import("@/app/api/chat/route");

afterEach(() => {
  vi.clearAllMocks();
});

/** A chunked body with no Content-Length: the guard must count, not trust a header. */
function chunkedRequest(url: string, total: number): Request {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(64 * 1024, total - sent);
      sent += n;
      c.enqueue(new Uint8Array(n).fill(0x30));
    },
  });
  return new Request(url, { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

const TRPC_URL = "https://app.example.com/api/trpc/briefs.preview?batch=1";
const CHAT_URL = "https://app.example.com/api/chat";

describe("/api/trpc/[trpc]", () => {
  it("answers 413 for an over-limit body and never reaches the tRPC handler", async () => {
    const res = await trpcRoute.POST(chunkedRequest(TRPC_URL, MAX_REQUEST_BODY_BYTES + 1));
    expect(res.status).toBe(413);
    expect(fetchRequestHandler).not.toHaveBeenCalled();
  });

  it("answers 413 when Content-Length declares an over-limit body", async () => {
    const big = "0".repeat(MAX_REQUEST_BODY_BYTES + 1);
    const res = await trpcRoute.POST(new Request(TRPC_URL, { method: "POST", body: big }));
    expect(res.status).toBe(413);
    expect(fetchRequestHandler).not.toHaveBeenCalled();
  });

  it("passes a body just under the limit through unchanged", async () => {
    const body = JSON.stringify({ 0: { json: { rule: { skipDates: [] }, pad: "x".repeat(MAX_REQUEST_BODY_BYTES - 100) } } });
    expect(body.length).toBeLessThan(MAX_REQUEST_BODY_BYTES);
    const res = await trpcRoute.POST(new Request(TRPC_URL, { method: "POST", body }));
    expect(res.status).toBe(200);
    expect(fetchRequestHandler).toHaveBeenCalledTimes(1);
    expect(((await res.json()) as { echoed: string }).echoed).toBe(body);
  });

  it("leaves GET queries untouched", async () => {
    const res = await trpcRoute.GET(new Request(TRPC_URL + "&input=%7B%7D"));
    expect(res.status).toBe(200);
    expect(fetchRequestHandler).toHaveBeenCalledTimes(1);
  });
});

describe("/api/chat", () => {
  it("answers 413 for an over-limit body before the auth step runs", async () => {
    const res = await chatRoute.POST(chunkedRequest(CHAT_URL, MAX_REQUEST_BODY_BYTES * 2));
    expect(res.status).toBe(413);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    const body = (await res.json()) as { code: string; userMessage: string };
    expect(body.code).toBe("payload_too_large");
    expect(body.userMessage.length).toBeGreaterThan(0);
  });

  it("passes an under-limit body through to the route (thread lookup runs on its threadId)", async () => {
    const body = JSON.stringify({
      threadId: "00000000-0000-4000-8000-000000000000",
      messages: [{ role: "user", content: "x".repeat(MAX_REQUEST_BODY_BYTES - 200) }],
    });
    const res = await chatRoute.POST(new Request(CHAT_URL, { method: "POST", body }));
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });
});
