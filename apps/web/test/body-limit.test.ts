/**
 * Slice 005 (decision 0013, option B): the request-size guard in front of
 * every Zod parse of caller-controlled input.
 *
 * zod 3.25.76 builds one issue object per bad array element even after a
 * `.max()` breach (GHSA-mrhx-c7xc-m3w5), so the only bound that holds is the
 * number of bytes the parser is ever handed. These tests lock in:
 *   - over-limit bodies are refused with 413 whether `Content-Length` is
 *     honest, lying (too small) or absent (a chunked stream);
 *   - the reader stops pulling from the stream at the limit;
 *   - a body just under the limit passes through byte for byte;
 *   - the largest legitimate tRPC request (a spec save at every schema
 *     maximum, as a superjson batch) fits under the tRPC limit with margin.
 * Review fixes (docs/records/reviews/005-zod-guard-security.md):
 *   - F4: each limit's exact value is pinned; the abort signal reaches the
 *     handler; a real `Transfer-Encoding: chunked` request over a socket is
 *     bounded; an errored stream is covered.
 *   - F3: a body stream that errors mid-read reaches the handler as the same
 *     read error (so the route gives its own pre-guard 400), never a 500 and
 *     never a partial body.
 */
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { z } from "zod";
import {
  CHAT_BODY_LIMIT_BYTES,
  PAYLOAD_TOO_LARGE_MESSAGE,
  TRPC_BODY_LIMIT_BYTES,
  readBodyWithLimit,
  withBodyLimit,
} from "@/server/http/body-limit";
import { DIGEST_SPEC_SCHEMA_VERSION, digestSpecSchema } from "@/lib/digest-spec/schema";

/** The limit the reader tests run at; both route limits are pinned below. */
const MAX_REQUEST_BODY_BYTES = CHAT_BODY_LIMIT_BYTES;

const URL_ = "https://app.example.com/api/trpc/briefs.updateRaw";

/** A stream that hands out `total` bytes in `chunk`-sized pieces and counts pulls. */
function countingStream(total: number, chunk = 64 * 1024) {
  let sent = 0;
  const stats = { pulled: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const n = Math.min(chunk, total - sent);
      sent += n;
      stats.pulled += n;
      controller.enqueue(new Uint8Array(n).fill(0x30));
    },
  });
  return { stream, stats };
}

function streamRequest(total: number, headers: Record<string, string> = {}) {
  const { stream, stats } = countingStream(total);
  const req = new Request(URL_, {
    method: "POST",
    body: stream,
    headers,
    // Required by undici for a streamed request body.
    duplex: "half",
  } as RequestInit);
  return { req, stats };
}

describe("the limits", () => {
  it("pins chat at 1 MiB and tRPC at 384 KiB", () => {
    expect(CHAT_BODY_LIMIT_BYTES).toBe(1_048_576);
    expect(TRPC_BODY_LIMIT_BYTES).toBe(393_216);
  });
});

describe("readBodyWithLimit", () => {
  it("refuses an honest Content-Length over the limit without reading the body", async () => {
    const total = MAX_REQUEST_BODY_BYTES + 1;
    const { req, stats } = streamRequest(total, { "content-length": String(total) });
    const out = await readBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
    expect(out).toEqual({ ok: false, reason: "too_large" });
    expect(stats.pulled).toBeLessThanOrEqual(64 * 1024);
  });

  it("refuses a body with no Content-Length once the running count passes the limit", async () => {
    const { req, stats } = streamRequest(MAX_REQUEST_BODY_BYTES * 4);
    expect(req.headers.get("content-length")).toBeNull();
    const out = await readBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
    expect(out.ok).toBe(false);
    // Stopped at the limit (plus at most one chunk and one read-ahead), not at 4x.
    expect(stats.pulled).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES + 2 * 64 * 1024);
  });

  it("refuses a body whose Content-Length lies (claims small, sends large)", async () => {
    const { req, stats } = streamRequest(MAX_REQUEST_BODY_BYTES * 4, { "content-length": "10" });
    const out = await readBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
    expect(out.ok).toBe(false);
    expect(stats.pulled).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES + 2 * 64 * 1024);
  });

  it("passes a body exactly at the limit byte for byte", async () => {
    const { req } = streamRequest(MAX_REQUEST_BODY_BYTES);
    const out = await readBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.body?.byteLength).toBe(MAX_REQUEST_BODY_BYTES);
  });

  it("passes a request with no body", async () => {
    const out = await readBodyWithLimit(new Request(URL_, { method: "GET" }), MAX_REQUEST_BODY_BYTES);
    expect(out).toEqual({ ok: true, body: null });
  });

  it("reports a stream that errors mid-read as a read failure carrying the error", async () => {
    const boom = new Error("client aborted");
    const out = await readBodyWithLimit(erroringRequest(boom), MAX_REQUEST_BODY_BYTES);
    expect(out).toEqual({ ok: false, reason: "read_failed", error: boom });
  });
});

/** A streamed POST that hands out one chunk, then errors (a client that drops mid-upload). */
function erroringRequest(error: Error, url = URL_) {
  let sent = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (!sent) {
        sent = true;
        c.enqueue(new TextEncoder().encode('{"0":{"json":'));
        return;
      }
      c.error(error);
    },
  });
  return new Request(url, {
    method: "POST",
    body: stream,
    headers: { "content-type": "application/json" },
    duplex: "half",
  } as RequestInit);
}

describe("withBodyLimit", () => {
  it("answers 413 with the copy-guide envelope and never calls the handler", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const guarded = withBodyLimit(handler, MAX_REQUEST_BODY_BYTES);
    const { req } = streamRequest(MAX_REQUEST_BODY_BYTES + 1);
    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ code: "payload_too_large", userMessage: PAYLOAD_TOO_LARGE_MESSAGE });
  });

  it("hands the handler the caller's abort signal", async () => {
    const ac = new AbortController();
    let signal: AbortSignal | null = null;
    const guarded = withBodyLimit(async (r: Request) => {
      signal = r.signal;
      return new Response("ok");
    }, MAX_REQUEST_BODY_BYTES);
    await guarded(new Request(URL_, { method: "POST", body: "x", signal: ac.signal }));
    expect(signal).not.toBeNull();
    expect(signal!.aborted).toBe(false);
    ac.abort();
    expect(signal!.aborted).toBe(true);
  });

  it("hands an errored stream on as the same read error, never a partial body", async () => {
    const boom = new Error("client aborted");
    let readError: unknown = null;
    const handler = vi.fn(async (r: Request) => {
      readError = await r.text().then(
        () => null,
        (e: unknown) => e
      );
      return new Response("handled", { status: 400 });
    });
    const res = await withBodyLimit(handler, MAX_REQUEST_BODY_BYTES)(erroringRequest(boom));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
    expect(readError).toBe(boom);
  });

  it("gives the real tRPC handler's own 400 for an errored stream, as without the guard", async () => {
    const t = initTRPC.create({ transformer: superjson });
    const router = t.router({ save: t.procedure.input(z.object({ a: z.number() })).mutation(() => 1) });
    const handle = (req: Request) =>
      fetchRequestHandler({ endpoint: "/api/trpc", req, router, createContext: () => ({}) });
    const url = "https://app.example.com/api/trpc/save";
    const unguarded = await handle(erroringRequest(new Error("client aborted"), url));
    const guarded = await withBodyLimit(handle, MAX_REQUEST_BODY_BYTES)(
      erroringRequest(new Error("client aborted"), url)
    );
    expect(unguarded.status).toBe(400);
    expect(guarded.status).toBe(unguarded.status);
  });

  it("hands the handler a rebuilt request with the same body, method, URL and headers", async () => {
    const payload = JSON.stringify({ 0: { json: { hello: "wörld" } } });
    let seen: { text: string; method: string; url: string; ct: string | null } | null = null;
    const guarded = withBodyLimit(async (r: Request) => {
      seen = {
        text: await r.text(),
        method: r.method,
        url: r.url,
        ct: r.headers.get("content-type"),
      };
      return new Response("ok");
    }, MAX_REQUEST_BODY_BYTES);
    const res = await guarded(
      new Request(URL_ + "?batch=1", {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual({
      text: payload,
      method: "POST",
      url: URL_ + "?batch=1",
      ct: "application/json",
    });
  });

  it("passes a GET (tRPC query, input in the URL) through untouched", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const req = new Request(URL_ + "?input=%7B%7D", { method: "GET" });
    await withBodyLimit(handler, MAX_REQUEST_BODY_BYTES)(req);
    expect(handler).toHaveBeenCalledWith(req);
  });
});

/**
 * A real `Transfer-Encoding: chunked` request with no `Content-Length`, over
 * a socket into a Node server that builds the fetch Request the way Next does.
 */
describe("withBodyLimit over a real chunked HTTP request", () => {
  async function send(limit: number, total: number) {
    let seen: { te: string | null; cl: string | null; bytes: number } | null = null;
    const handler = vi.fn(async (r: Request) => {
      const bytes = (await r.arrayBuffer()).byteLength;
      seen = { te: r.headers.get("transfer-encoding"), cl: r.headers.get("content-length"), bytes };
      return new Response("ok");
    });
    const guarded = withBodyLimit(handler, limit);
    let te: string | undefined;
    let cl: string | undefined;
    const server = createServer(async (req, res) => {
      te = req.headers["transfer-encoding"];
      cl = req.headers["content-length"];
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const out = await guarded(
        new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers,
          body: Readable.toWeb(req) as ReadableStream,
          duplex: "half",
        } as RequestInit)
      );
      res.writeHead(out.status, { connection: "close" });
      res.end(await out.text());
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, method: "POST", path: "/api/trpc/x", headers: { "transfer-encoding": "chunked" } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on("error", (e: NodeJS.ErrnoException) => (e.code === "EPIPE" || e.code === "ECONNRESET" ? undefined : reject(e)));
      const chunk = Buffer.alloc(16 * 1024, 0x30);
      for (let sent = 0; sent < total; sent += chunk.length) {
        req.write(chunk.subarray(0, Math.min(chunk.length, total - sent)));
      }
      req.end();
    });
    server.close();
    return { status, te, cl, handler, seen: seen as { te: string | null; cl: string | null; bytes: number } | null };
  }

  it("refuses an over-limit chunked body with 413 and never calls the handler", async () => {
    const out = await send(64 * 1024, 64 * 1024 + 1);
    expect(out.te).toBe("chunked");
    expect(out.cl).toBeUndefined();
    expect(out.status).toBe(413);
    expect(out.handler).not.toHaveBeenCalled();
  });

  it("passes an at-limit chunked body through whole", async () => {
    const out = await send(64 * 1024, 64 * 1024);
    expect(out.status).toBe(200);
    expect(out.seen?.bytes).toBe(64 * 1024);
  });
});

describe("largest legitimate request", () => {
  it("a spec save at every schema maximum, batched, fits under the tRPC limit with 1.5x margin", () => {
    // Worst realistic encoding: every character a 3-byte UTF-8 code unit.
    const s = (n: number) => "語".repeat(n);
    const spec = digestSpecSchema.parse({
      schema_version: DIGEST_SPEC_SCHEMA_VERSION,
      topics: Array.from({ length: 20 }, () => s(120)),
      entities: {
        companies: Array.from({ length: 50 }, () => s(120)),
        tickers: Array.from({ length: 50 }, () => "ABCDEFGHIJKLMNOP"),
        commodities: Array.from({ length: 50 }, () => "ABCDEFGHIJKLMNOP"),
      },
      keywords_include: Array.from({ length: 50 }, () => s(80)),
      keywords_exclude: Array.from({ length: 50 }, () => s(80)),
      data_addons: { fx_pairs: Array.from({ length: 10 }, () => "MYR/USD") },
      rss_feeds: Array.from({ length: 20 }, (_, i) => ({
        url: `https://example.com/${String(i).padStart(2, "0")}/`.padEnd(500, "a"),
        label: s(80),
      })),
      cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] },
    });
    const call = superjson.serialize({ id: "00000000-0000-0000-0000-000000000000", spec });
    // httpBatchLink: { "0": {json, meta}, "1": ... } — assume a batch of three such saves.
    const body = JSON.stringify({ 0: call, 1: call, 2: call });
    const bytes = new TextEncoder().encode(body).byteLength;
    // Measured 2026-11-13: 202,258 bytes (docs/slices/005-zod-guard/notes.md).
    // The tRPC limit must stay at least 1.5x above it.
    expect(bytes).toBe(202_258);
    expect(bytes * 1.5).toBeLessThanOrEqual(TRPC_BODY_LIMIT_BYTES);
  });
});
