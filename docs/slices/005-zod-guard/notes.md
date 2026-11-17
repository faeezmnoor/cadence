<!-- layer: knowledge · status: living (while open) · verified: 2026-11-17 -->
# 005 · zod-guard — notes

## Entry points (every route handler under apps/web/app)
| Route | Parses caller input with Zod? | Guard |
| --- | --- | --- |
| `/api/trpc/[trpc]` POST | Yes: every mutation's `.input()` (e.g. `briefs.updateRaw` → `digestSpecSchema`) | `withBodyLimit` at 384 KiB; bounded `errorFormatter` |
| `/api/trpc/[trpc]` GET | Yes: every query's `.input()`, read from the URL. `briefs.preview` is the one caller path to `schedulingRuleV1` | No body to guard; Node's header cap bounds the URL (below); bounded `errorFormatter` |
| `/api/chat` POST | Yes, indirectly: `streamText` (ai 4.3) checks the messages with `z.array(coreMessageSchema)` | `withBodyLimit` at 1 MiB ahead of auth, then a hand-written shape check before any write or `streamText` |
| `/api/auth/sign-in` POST | No (`{ email }`, a `typeof` check) | None |
| `/api/telegram/webhook` POST | No (grammY, secret header) | None |
| `/api/inngest` (GET, POST, PUT) | The SDK parses with Zod, but only after its signature check | None |
| `/api/dev-smoke`, `/auth/callback`, `/auth/sign-out` | No | None |
| `middleware.ts` | No (refreshes the session cookie; never reads the body) | None |
No server actions (`"use server"`) exist. Correction (review F6): the first version of these notes listed `briefs.preview` as body-guarded. It is a `.query`, so it arrives by GET and the guard never sees it; the route test now posts to `briefs.updateRaw`.

## Limits
- Chat: `CHAT_BODY_LIMIT_BYTES` = 1 MiB (1,048,576 bytes). tRPC: `TRPC_BODY_LIMIT_BYTES` = 384 KiB (393,216 bytes). Both in apps/web/server/http/body-limit.ts, both pinned by tests.
- Largest legitimate tRPC request (verified, test/body-limit.test.ts): a spec save at every schema maximum, every character 3-byte UTF-8, as a batch of three = 202,258 bytes (one save about 67 KB). Margin at 384 KiB: 1.94x for the batch, about 5.8x for one save.
- Largest legitimate chat request (inferred, no production data read): `useChat` sends the whole visible thread every turn. A typical exchange is 1 to 2 KB; 1 MiB holds several hundred.
- Chat shape check (apps/web/server/chat/message-shape.ts): at most 200 messages and 500 elements that can reach Zod, on the messages `streamText` will see.

## Measured peaks (verified; Node 26, arm64 Mac, zod 3.25.76, ai 4.3.19, @trpc/server 11.13)
Peak resident memory per request from `process.resourceUsage().maxRSS`, a fresh process per case. Scripts: measure-chat.mjs (gate G13), measure-trpc.mjs (gate G14).
- Chat, worst payload the shape check accepts, through the real `streamText` with a mock model: 216 MB (500 unknown content parts in one message; the SDK refuses it). Before the fix: 2.4 GB at 256 KiB, 5.4–7.1 GB at 1 MiB (review and validator).
- tRPC, production mode, real `fetchRequestHandler` and the bounded formatter, worst body `rss_feeds:[{},…]` (two issues per 3-byte element): 910 MB at 512 KiB, about 685 MB at 384 KiB, 580 MB at 296 KiB (1.5x the largest legitimate request). `topics:[0,…]`: about 415 MB at 384 KiB. Response: about 2 KB at any size (was 58–233 MB). Non-production now measures the same, since the stack is gone.
- tRPC GET at Node's header cap: `http.maxHeaderSize` is 16,384 bytes and covers the request line, so a query's input is at most about 16 KB. The worst case (`briefs.preview` with `skipDates:[0,…]`) measures 118 MB. Vercel's own URL cap is lower (14 KB, from its documented limits; inferred, not re-read). No in-app cap needed.

## Arrays bounded
- `cadence.weekdays` (daily) and (weekly) in apps/web/lib/scheduling/rule.ts: `.max(7)`, seven ISO weekdays.
- `skipDates`: `.max(366)`, one year of daily skips; beyond that `endDate` or pausing is the tool. Nothing in the app writes `skipDates` today.
- Every other `z.array` in apps/web already has `.max()` (digest spec, composer, extractor, the two `specIds` inputs). The two config-agent tool arrays (`ask_user`, `suggest_quick_replies`) are model output, not caller input.

## Builder decisions
- Guard placement in the tRPC route file, despite its "no auth or logging here" note (verified): it must run before tRPC reads the body. A size bound is neither auth nor logging; the header comment says so.
- Chat guard runs before auth (verified by test): an over-limit request gets 413 instead of 401 or 429.
- One wrapper for both routes, a limit per route, the limit parameter required (verified by tests pinning each value and each route's one-byte-over refusal).
- A body stream that errors mid-read is handed to the route as that same error, so tRPC and chat give the 400 they gave before the guard (verified against the real tRPC handler and the chat route). Not a 400 from the guard: the route's own answer is the pre-guard behaviour.
- tRPC limit 384 KiB, not 512 KiB (verified by measurement): 512 KiB measured 910 MB. 384 KiB still measures about 685 MB, above the fix round's ~600 MB target; under 600 MB needs a limit below 1.5x the largest legitimate request, which the brief rules out. Gate G14's budget is 750 MB so a regression fails.
- The shape check runs after the thread and gate lookups (reads only) because the mode decides which messages are forwarded: manage mode forwards only the last 20 (`capManageTranscript`), so a manage thread older than 200 messages is never refused for its age (verified by test). It runs before the user message is saved, the extractor and `streamText` (verified by test: no insert, no update, no `streamText` on refusal).
- The element count covers only what the SDK can hand to Zod (verified in ai 4.3.19 `convertToCoreMessages`): `step-start` and `source` parts are dropped before validation, and `toolInvocations` is read only when a message has no `parts`. A live assistant turn repeats each tool call in both arrays, so counting every array, as first proposed, would refuse a real 200-message thread (about 800 elements). Reasoning `details` and attachments are counted.
- Allowed part types are the six the AI SDK 4.x UI stream produces (`text`, `step-start`, `tool-invocation`, `source`, `reasoning`, `file`); anything else is refused (inferred from @ai-sdk/ui-utils 1.2.11; gpt-4o-mini emits only text and tool calls).
- `providerOptions` and `experimental_providerMetadata` are refused on messages and parts (verified in the SDK schemas): Zod checks them key by key, so one element could carry thousands of bad keys under the element cap. `useChat` never sends them.
- Refusal is `400 { error: "bad request" }`, the route's existing envelope; only a short reason code is logged. The route's catch logs at most 500 characters of the error (an SDK error embedded a 13-million-character Zod report).
- tRPC error formatter: Zod errors become "Invalid input" with at most 20 issues (code, path, message) plus `zodIssueCount`; other messages are cut to 500 characters; no stack in any environment (verified by test). No client reads `zodError` or the stack (verified by search).
- 413 on chat (verified by test; not run in a browser): no Retry for `payload_too_large`, and the client drops the unsent user message, which the server never saved. Words, COPY_GUIDE §6–7: "That message is too long to send. Nothing was saved — try a shorter one." The 413 envelope is `{ code, userMessage }`; the duplicate `error` field is gone (no client read it).
- Words file: the brief and dispatch cite docs/design/words.md, which does not exist in this repository; apps/web/COPY_GUIDE.md is the words source here (AGENTS.md §5), so the string follows it.

## What is still not bounded (residual risk, plain words)
- One tRPC request can still use about 685 MB, and one chat request about 216 MB. The project runs at Vercel's default function memory (2 GB, per the review), so one request no longer exhausts an instance, but three bad tRPC requests landing on the same instance at once could. Rate limiting tRPC per user, or zod 4 (option A), would close that.
- Zod still builds every issue before the formatter trims the response; the byte limit is what bounds that work on zod 3.
- A chat thread whose visible history passes 1 MiB gets 413 on every turn, and sending a shorter message does not help. That needs hundreds of exchanges. Capping what `useChat` sends would remove it (a client change outside this brief).
- Entry points without a Zod parse read their bodies unbounded (table above).
- Measurements are local on Node 26; production runs Node 22 on Vercel. Not re-measured there.
