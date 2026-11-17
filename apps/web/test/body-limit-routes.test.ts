/**
 * Slice 005: the two HTTP entry points that hand caller-controlled input to
 * Zod sit behind `withBodyLimit`, each at its own limit.
 *   - /api/trpc/[trpc] (512 KiB): every mutation's `.input()` arrives in the
 *     POST body (e.g. briefs.updateRaw). Queries such as briefs.preview arrive
 *     by GET, carry their input in the URL and have no body to guard.
 *   - /api/chat (1 MiB): `streamText` validates `body.messages` with
 *     `z.array(coreMessageSchema)` (ai 4.x standardizePrompt); the shape
 *     check in front of it is tested in chat-route-shape.test.ts.
 * An over-limit body gets 413 before the tRPC handler or the chat auth step
 * runs; an at-limit body reaches them unchanged; a body stream that errors
 * gives the route's own pre-guard 400.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_BODY_LIMIT_BYTES, TRPC_BODY_LIMIT_BYTES } from "@/server/http/body-limit";

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

const TRPC_URL = "https://app.example.com/api/trpc/briefs.updateRaw?batch=1";

/** A body of exactly `n` bytes of valid-looking JSON. */
function bodyOf(n: number): string {
  const head = '{"0":{"json":{"pad":"';
  const tail = '"}}}';
  return head + "x".repeat(n - head.length - tail.length) + tail;
}
const CHAT_URL = "https://app.example.com/api/chat";

describe("/api/trpc/[trpc]", () => {
  it("answers 413 for an over-limit body and never reaches the tRPC handler", async () => {
    const res = await trpcRoute.POST(chunkedRequest(TRPC_URL, TRPC_BODY_LIMIT_BYTES + 1));
    expect(res.status).toBe(413);
    expect(fetchRequestHandler).not.toHaveBeenCalled();
  });

  it("answers 413 when Content-Length declares an over-limit body", async () => {
    const big = "0".repeat(TRPC_BODY_LIMIT_BYTES + 1);
    const res = await trpcRoute.POST(new Request(TRPC_URL, { method: "POST", body: big }));
    expect(res.status).toBe(413);
    expect(fetchRequestHandler).not.toHaveBeenCalled();
  });

  it("passes a body exactly at the tRPC limit through unchanged", async () => {
    const body = bodyOf(TRPC_BODY_LIMIT_BYTES);
    expect(body.length).toBe(TRPC_BODY_LIMIT_BYTES);
    const res = await trpcRoute.POST(new Request(TRPC_URL, { method: "POST", body }));
    expect(res.status).toBe(200);
    expect(fetchRequestHandler).toHaveBeenCalledTimes(1);
    expect(((await res.json()) as { echoed: string }).echoed).toBe(body);
  });

  it("uses the tRPC limit, not the chat limit (one byte over 512 KiB is refused)", async () => {
    const res = await trpcRoute.POST(new Request(TRPC_URL, { method: "POST", body: bodyOf(TRPC_BODY_LIMIT_BYTES + 1) }));
    expect(res.status).toBe(413);
    expect(TRPC_BODY_LIMIT_BYTES).toBeLessThan(CHAT_BODY_LIMIT_BYTES);
  });

  it("leaves GET queries untouched", async () => {
    const res = await trpcRoute.GET(new Request(TRPC_URL + "&input=%7B%7D"));
    expect(res.status).toBe(200);
    expect(fetchRequestHandler).toHaveBeenCalledTimes(1);
  });
});

describe("/api/chat", () => {
  it("answers 413 for an over-limit body before the auth step runs", async () => {
    const res = await chatRoute.POST(chunkedRequest(CHAT_URL, CHAT_BODY_LIMIT_BYTES + 1));
    expect(res.status).toBe(413);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    const body = (await res.json()) as { code: string; userMessage: string };
    expect(body.code).toBe("payload_too_large");
    expect(body.userMessage.length).toBeGreaterThan(0);
  });

  it("passes a body exactly at the chat limit through to the route (thread lookup runs on its threadId)", async () => {
    const head = '{"threadId":"00000000-0000-4000-8000-000000000000","messages":[{"role":"user","content":"';
    const tail = '"}]}';
    const body = head + "x".repeat(CHAT_BODY_LIMIT_BYTES - head.length - tail.length) + tail;
    expect(body.length).toBe(CHAT_BODY_LIMIT_BYTES);
    const res = await chatRoute.POST(new Request(CHAT_URL, { method: "POST", body }));
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });

  it("gives the pre-guard 400 (after auth) when the body stream errors mid-read", async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent) return c.error(new Error("client aborted"));
        sent = true;
        c.enqueue(new TextEncoder().encode('{"threadId":'));
      },
    });
    const res = await chatRoute.POST(
      new Request(CHAT_URL, { method: "POST", body: stream, duplex: "half" } as RequestInit)
    );
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
    expect(limit).not.toHaveBeenCalled();
  });
});
