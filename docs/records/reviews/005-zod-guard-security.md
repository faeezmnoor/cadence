<!-- layer: records · status: record · verified: 2026-11-16 -->
# Review: 005-zod-guard (security and correctness lane)

Range: `origin/main...HEAD` on `slice/005-zod-guard` (HEAD 08ffdca). Independent reviewer; no product file was changed. Planted defects ran in a detached scratch worktree, one at a time, each restored from a saved copy.

## Summary
- No way past the guard was found. Chunked bodies, no `Content-Length`, a lying `Content-Length`, PUT, multipart, octet-stream and a method-override header all get 413. GET has no body, and its input is limited by the platform's URL length. Headers, cookies, method, URL, abort signal and tRPC batching all survive the rebuilt Request.
- The bound it claims does not hold. Notes.md and decision 0013 say one request under 1 MiB costs "about 180 MB". That figure comes from a bare `safeParse`. Run end to end, one sub-limit request costs 2.0–3.2 GB of peak memory through tRPC and 5.8–7.1 GB through `/api/chat`. The project sets no function memory in `vercel.json`, so it runs at the 2 GB default. **One request from any signed-in account can still exhaust an instance on both entry points.** The slice exists to prevent exactly that.
- Full verification passes at HEAD (`pnpm typecheck && pnpm lint && pnpm test`: exit 0, 1245 passed, 25 skipped). The builder's plant.sh catches 6 of its 6 defects.

## Findings (severity × confidence)
| # | Sev | Conf | Finding | Reproduce | Fix |
|---|---|---|---|---|---|
| F1 | P0 | 90 | `/api/chat`: no byte limit makes the AI SDK check affordable. In `streamText` (ai 4.3.19), `standardizePrompt` runs `z.array(coreMessageSchema)`, and every bad element builds a nested union error. Elements shaped like `{"content":[0,…]}` pass `detectPromptType`. If the last message is not a user turn, the route makes no paid call before `streamText`. A setup-mode thread skips `capManageTranscript`. The sync throw is caught and `err.message` is logged; one run measured a 300,856,854-character message. | Probe: `streamText` with a mock model and about 1 MB of `messages`. 16-zero `content` elements: peak RSS 5,840 MB, 18.9 s CPU. One user message with a `[0,…]` parts array: RSS 7,088 MB, 21.7 s. At 256 KiB: RSS 2,410 MB. (Baseline process RSS: 49 MB.) | No size limit alone is enough (256 KiB still costs 2.4 GB). Check the message shape by hand before `streamText`: a count cap, roles from a fixed set, string content or a capped parts array. Better: take only the latest user turn from the client and rebuild history from `chat_messages`. Then give chat its own byte limit. Correct notes.md and decision 0013. |
| F2 | P1 | 85 | tRPC: the real cost is about 11–18x the recorded 180 MB. The fetch adapter turns every Zod issue into the error message and returns it in the response. The heap and the response both grow with the body. | Probe: the real `fetchRequestHandler` and `withBodyLimit`, a mutation with the `updateRaw` array shapes. `topics:[0,…]` at 1 MiB: RSS 1,982 MB, 247 MB response. `rss_feeds:[{},…]` at 1 MiB: RSS 3,184 MB, 328 MB response. At 256 KiB: 597 MB and 923 MB. | Give tRPC its own limit of 256 KiB. `withBodyLimit` already takes a `limit` argument. The largest single save is about 67 KB (3.9x margin). The 202 KB figure is a made-up batch of three saves, which the client never sends. Record the end-to-end figures in place of 180 MB. |
| F3 | P2 | 90 | Behaviour change under the limit. If the body stream fails mid-read, `reader.read()` rejects and the error escapes the route handler (unhandled, 500). Before this change tRPC answered 400, and chat answered 400 after auth. The brief says requests under the limit keep their behaviour. | Same probe, with a stream that errors after the first chunk: guarded, the route throws "client aborted"; unguarded, tRPC answers 400 BAD_REQUEST. | Catch read errors in `readBodyWithLimit` and answer 400. Add a test. |
| F4 | P2 | 90 | Gaps in the tests (survivors R4, R5, R7, R10 below). No test fixes the limit's value: raising it to 4 MiB, the measured 690 MB case, passes every test. A dropped abort signal passes. A guard that skips `Transfer-Encoding: chunked` passes, because the test's "chunked" request has no such header. Swallowing a stream error and passing on a partial body passes. Raising the limit is the likely response to F5, so this gap matters. | See the planted-defect table. | Pin the limit value(s) in a test. Assert that the abort signal reaches the handler. Give the chunked test a `transfer-encoding: chunked` header. Add a test for a stream that errors. |
| F5 | P2 | 80 | The 413 copy can be untrue. "Try again with less" sits above the chat error bubble's Retry button, which resends the same payload. On a long thread the payload is the history the client hydrated, not what the user typed: `app/chat/page.tsx` loads every unarchived message. That user cannot send less, so every turn fails. At 1 MiB this needs hundreds of exchanges and is rare. At any lower chat limit it becomes likely. The rest of the copy (8-word first beat, one spaced em dash, no exclamation) meets COPY_GUIDE §6–7. | Read `chat-client.tsx` (error bubble with Retry) and `app/chat/page.tsx` (history query with no cap). | Fixed once F1 rebuilds history on the server. Otherwise use a chat-specific action ("start a new chat") and leave out Retry for `payload_too_large`. |
| F6 | P3 | 85 | The docs give the wrong path. Notes.md (and the route test URL) present `briefs.preview` → `schedulingRuleV1` as a body-guarded path. `preview` is a `.query`, so it arrives by GET and the guard never sees it. There `skipDates` is limited only by URL length; at about 14 KB that is harmless. The route test POSTs to `briefs.preview` against a mocked adapter. The real adapter would answer 405. | `server/trpc/routers/briefs.ts` (`preview … .query`). | Correct the notes. Point the route test at a mutation such as `briefs.updateRaw`. |
| F7 | P3 | 90 | Gate ledger. G10 greps `docs/slices/005-zod-guard/review.md`, but reviews live at `docs/records/reviews/<id>-<lane>.md`, so G10 cannot pass as written. G1–G9 are stamped at 53610c6, not HEAD 08ffdca; the only difference is gates.md, so this is acceptable but stale. | `git diff --stat 53610c6 08ffdca`. | Point G10 at this file. Re-stamp at the final commit. |

### Pre-existing, outside this slice (follow-ups, not scored)
- The chat route saves the last user message with no size cap (now capped at 1 MiB) and passes it to the paid extractor call.
- `chat.appendMessage` takes `content: z.unknown()` and stores up to 1 MiB of arbitrary JSON.
- The chat catch block logs `err.message` without truncating it (see F1).

## Answers to the dispatch questions
1. **Bypass.** None found. Probe results with the real tRPC adapter and the guard: POST mutation, POST to a query, a method-override header, PUT, multipart, octet-stream, chunked, and a lying `Content-Length` all get 413, and Zod is reached 0 times. GET passes through and is limited by URL length. Under the limit:
   - a batch of two returns 200 with both results;
   - the cookie and authorization headers are kept;
   - aborting the original signal aborts the rebuilt one.

   The wrapper hands on a plain `Request`, not the `NextRequest`, and drops Next's second argument. Neither `createTRPCContext` nor the chat route uses `req.cookies`, `req.nextUrl` or route params; both read the session through `next/headers`. A stream error is the one behaviour change (F3).
2. **The number.** The 180 MB figure is reproduced for a bare `safeParse` (176 MB heap at 1 MiB, 64 MB at 256 KiB) and refuted end to end (F1, F2). What I would ship:
   - tRPC at 256 KiB;
   - chat with a hand-written shape check, or history rebuilt on the server, ahead of `streamText`;
   - a limit for each route, each with a pinned test.

   Both route limits alone, with no shape check on chat, would still leave chat at more than 2 GB per request.
3. **Chat before auth.** This is correct and harmless. An unauthenticated over-limit request now gets 413 instead of 401, and nothing is written. An anonymous caller can make the function buffer up to 1 MiB, which the platform already buffers. Copy: see F5.
4. **Missed entry points.** None.
   - There are no `"use server"` files.
   - The app has eight route handlers. Apart from tRPC and chat, none parses caller input with Zod.
   - Inngest 4.5.0 awaits signature validation (`InngestCommHandler.js` around line 820) before `runStep` → `parseFnData` (around line 896).
   - The Telegram webhook checks the secret, then `req.json()`; it has no Zod parse.
   - No page parses `searchParams` with Zod on the server.
5. **Do the tests prove it?** Yes for "the router is never reached": removing either wrapper fails the route tests (builder plants 2 and 3, and my R9). No for the limit's value, the abort signal, a realistic chunked request or a stream error (F4).

## Planted defects (reviewer's own; 10 planted, 6 caught, 4 survived)
| # | Defect | Result |
|---|---|---|
| R1 | Count checked only after the whole stream is read | caught |
| R2 | Off by one: a body exactly at the limit is refused | caught |
| R3 | Rebuilt request drops the headers | caught |
| R4 | Rebuilt request drops the abort signal | **survived** |
| R5 | `MAX_REQUEST_BODY_BYTES` raised to 4 MiB | **survived** |
| R6 | A declared `Content-Length` under the limit is trusted (no counting) | caught |
| R7 | Guard skipped when `Transfer-Encoding` is present | **survived** |
| R8 | Guard skipped when the `batch` query flag is present | caught |
| R9 | Chat wrapped with a 2 MiB limit | caught |
| R10 | Stream error swallowed, partial body handed on | **survived** |

Builder's plant.sh, re-run in the scratch worktree: 6 of 6 caught.

## Delete list
- The `R extends Request` generic on `withBodyLimit`: `(request: Request) => Promise<Response>` is enough.
- The `console.info` in the largest-request test.
- The duplicate `error` field in the 413 envelope, if no client reads it (the chat client reads `code` and `userMessage`).
- Keep the `limit` parameter: the F1 and F2 fixes need it.

## Not checked
- Production behaviour on Vercel: the measurements are local, on Node 26; production runs Node 22. Fluid-compute concurrency on one instance was not modelled; it makes F1 and F2 worse.
- The 413 in a browser.
- `pnpm audit` (G5) and the standard check (G6) were not re-run.

VERDICT: BLOCK
