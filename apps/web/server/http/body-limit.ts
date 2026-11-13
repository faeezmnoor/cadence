/**
 * Request-size guard for every HTTP entry point that hands caller-controlled
 * input to Zod (slice 005, decision 0013 option B).
 *
 * Why bytes and not `.max()`: zod 3.25.76 (GHSA-mrhx-c7xc-m3w5) still parses
 * every element of an array after a `.max()` breach and builds one issue
 * object per bad element, so heap grows with the body, not the schema.
 * Measured on this zod: about 180 MB of heap at 1 MiB of `[0,0,…]`, 643 MB at
 * 4 MiB. Bounding the bytes the parser can ever see is the bound that holds.
 *
 * `Content-Length` is only a fast path: the body is read with a running count
 * and reading stops as soon as the count passes the limit, so a chunked
 * request (no header) or a lying one is bounded too.
 *
 * The limit and its margin over the largest legitimate request are recorded
 * in docs/slices/005-zod-guard/notes.md.
 */

/** One limit for every guarded entry point (tRPC, /api/chat). 1 MiB. */
export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

/** apps/web/COPY_GUIDE.md §6–7: errors speak as "we", what happened → what it means → one action. */
export const PAYLOAD_TOO_LARGE_MESSAGE =
  "That was too much to send at once. Nothing was saved — try again with less.";

export type BoundedBody =
  | { ok: true; body: Uint8Array | null }
  | { ok: false };

/**
 * Read a request body, never holding more than `limit` bytes of it.
 * Returns `{ ok: false }` (and cancels the stream) as soon as the declared
 * or the counted size passes the limit.
 */
export async function readBodyWithLimit(
  request: Request,
  limit: number = MAX_REQUEST_BODY_BYTES
): Promise<BoundedBody> {
  if (request.body === null) return { ok: true, body: null };

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await request.body.cancel().catch(() => undefined);
    return { ok: false };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
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
    { error: "payload_too_large", code: "payload_too_large", userMessage: PAYLOAD_TOO_LARGE_MESSAGE },
    { status: 413 }
  );
}

/**
 * Wrap a route handler: refuse an over-limit body with 413 before the
 * handler runs, otherwise hand it a rebuilt Request carrying the bytes that
 * were read. Requests without a body (GET, HEAD) pass through untouched.
 */
export function withBodyLimit<R extends Request>(
  handler: (request: Request) => Promise<Response>,
  limit: number = MAX_REQUEST_BODY_BYTES
): (request: R) => Promise<Response> {
  return async (request: R) => {
    if (request.body === null) return handler(request);
    const read = await readBodyWithLimit(request, limit);
    if (!read.ok) return payloadTooLargeResponse();
    return handler(new Request(request, { body: read.body }));
  };
}
