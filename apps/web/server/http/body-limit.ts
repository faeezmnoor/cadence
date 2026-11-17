/**
 * Request-size guard for every HTTP entry point that hands caller-controlled
 * input to Zod (slice 005, decision 0013 option B).
 *
 * Why bytes: zod 3.25.76 (GHSA-mrhx-c7xc-m3w5) still parses every element of
 * an array after a `.max()` breach and builds one issue per bad element, so
 * memory grows with the body, not the schema. The byte limit bounds what the
 * parser can see; it is not enough on its own:
 *   - /api/chat also runs a hand-written shape check before `streamText`
 *     (server/chat/message-shape.ts);
 *   - tRPC also bounds its error response (server/trpc/error-format.ts).
 * Measured peaks and margins: docs/slices/005-zod-guard/notes.md.
 *
 * `Content-Length` is only a fast path: the body is read with a running count
 * and reading stops as soon as the count passes the limit, so a chunked
 * request (no header) or a lying one is bounded too.
 */

/** /api/chat: the whole visible thread rides in every turn. 1 MiB. */
export const CHAT_BODY_LIMIT_BYTES = 1024 * 1024;
/**
 * /api/trpc: 1.94x the largest legitimate request (202,258 bytes). 384 KiB.
 * Worst body at this limit peaks at about 685 MB (512 KiB: 910 MB); see notes.md.
 */
export const TRPC_BODY_LIMIT_BYTES = 384 * 1024;

/** apps/web/COPY_GUIDE.md §6–7: errors speak as "we", what happened → what it means → one action. */
export const PAYLOAD_TOO_LARGE_MESSAGE =
  "That was too much to send at once. Nothing was saved — try again with less.";

export type BoundedBody =
  | { ok: true; body: Uint8Array<ArrayBuffer> | null }
  | { ok: false; reason: "too_large" }
  | { ok: false; reason: "read_failed"; error: unknown };

/**
 * Read a request body, never holding more than `limit` bytes of it.
 * Returns `too_large` (and cancels the stream) as soon as the declared or
 * the counted size passes the limit, and `read_failed` with the stream's own
 * error if the stream errors mid-read.
 */
export async function readBodyWithLimit(request: Request, limit: number): Promise<BoundedBody> {
  if (request.body === null) return { ok: true, body: null };

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await request.body.cancel().catch(() => undefined);
    return { ok: false, reason: "too_large" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await reader.read();
    } catch (error) {
      return { ok: false, reason: "read_failed", error };
    }
    if (step.done) break;
    total += step.value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(step.value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}

export function payloadTooLargeResponse(): Response {
  // Shape matches the chat client's error envelope ({ code, userMessage }),
  // so /api/chat shows the message as-is; tRPC clients see a 413.
  return Response.json(
    { code: "payload_too_large", userMessage: PAYLOAD_TOO_LARGE_MESSAGE },
    { status: 413 }
  );
}

/** A body that fails with `error` on first read, so the handler meets the same failure it would have unguarded. */
function erroredBody(error: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(error);
    },
  });
}

/**
 * Wrap a route handler: refuse an over-limit body with 413 before the
 * handler runs, otherwise hand it a rebuilt Request (same method, URL,
 * headers and abort signal) carrying the bytes that were read. A stream that
 * errors mid-read is handed on as that same error, so the route answers as
 * it did before the guard existed (tRPC and chat: 400). Requests without a
 * body (GET, HEAD) pass through untouched.
 */
export function withBodyLimit(
  handler: (request: Request) => Promise<Response>,
  limit: number
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    if (request.body === null) return handler(request);
    const read = await readBodyWithLimit(request, limit);
    if (read.ok) return handler(new Request(request, { body: read.body }));
    if (read.reason === "too_large") return payloadTooLargeResponse();
    return handler(new Request(request, { body: erroredBody(read.error), duplex: "half" } as RequestInit));
  };
}
