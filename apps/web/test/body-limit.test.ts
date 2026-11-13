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
 *     maximum, as a superjson batch) fits under the limit with margin.
 */
import { describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import {
  MAX_REQUEST_BODY_BYTES,
  PAYLOAD_TOO_LARGE_MESSAGE,
  readBodyWithLimit,
  withBodyLimit,
} from "@/server/http/body-limit";
import { DIGEST_SPEC_SCHEMA_VERSION, digestSpecSchema } from "@/lib/digest-spec/schema";

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

describe("readBodyWithLimit", () => {
  it("refuses an honest Content-Length over the limit without reading the body", async () => {
    const total = MAX_REQUEST_BODY_BYTES + 1;
    const { req, stats } = streamRequest(total, { "content-length": String(total) });
    const out = await readBodyWithLimit(req);
    expect(out.ok).toBe(false);
    expect(stats.pulled).toBeLessThanOrEqual(64 * 1024);
  });

  it("refuses a body with no Content-Length once the running count passes the limit", async () => {
    const { req, stats } = streamRequest(MAX_REQUEST_BODY_BYTES * 4);
    expect(req.headers.get("content-length")).toBeNull();
    const out = await readBodyWithLimit(req);
    expect(out.ok).toBe(false);
    // Stopped at the limit (plus at most one chunk and one read-ahead), not at 4x.
    expect(stats.pulled).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES + 2 * 64 * 1024);
  });

  it("refuses a body whose Content-Length lies (claims small, sends large)", async () => {
    const { req, stats } = streamRequest(MAX_REQUEST_BODY_BYTES * 4, { "content-length": "10" });
    const out = await readBodyWithLimit(req);
    expect(out.ok).toBe(false);
    expect(stats.pulled).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES + 2 * 64 * 1024);
  });

  it("passes a body exactly at the limit byte for byte", async () => {
    const { req } = streamRequest(MAX_REQUEST_BODY_BYTES);
    const out = await readBodyWithLimit(req);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.body.byteLength).toBe(MAX_REQUEST_BODY_BYTES);
  });

  it("passes a request with no body", async () => {
    const out = await readBodyWithLimit(new Request(URL_, { method: "GET" }));
    expect(out).toEqual({ ok: true, body: null });
  });
});

describe("withBodyLimit", () => {
  it("answers 413 with the copy-guide envelope and never calls the handler", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const guarded = withBodyLimit(handler);
    const { req } = streamRequest(MAX_REQUEST_BODY_BYTES + 1);
    const res = await guarded(req);
    expect(res.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
    const body = (await res.json()) as { code: string; userMessage: string };
    expect(body.code).toBe("payload_too_large");
    expect(body.userMessage).toBe(PAYLOAD_TOO_LARGE_MESSAGE);
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
    });
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
    await withBodyLimit(handler)(req);
    expect(handler).toHaveBeenCalledWith(req);
  });
});

describe("largest legitimate request", () => {
  it("a spec save at every schema maximum, batched, fits under the limit with margin", () => {
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
    // Measured 2026-11-13: see docs/slices/005-zod-guard/notes.md.
    console.info(`[body-limit] max-bound spec save x3 batch = ${bytes} bytes`);
    expect(bytes).toBeLessThan(MAX_REQUEST_BODY_BYTES / 4);
  });
});
