<!-- layer: knowledge · status: living (while open) · verified: 2026-11-13 -->
# 005 · zod-guard — notes

## Entry points (every route handler under apps/web/app)
| Route | Parses caller input with Zod? | Guard |
| --- | --- | --- |
| `/api/trpc/[trpc]` (GET, POST) | Yes: every procedure `.input()`; `briefs.preview` reaches `schedulingRuleV1` | `withBodyLimit` wraps the handler; GET has no body and passes through |
| `/api/chat` (POST) | Yes, indirectly: `streamText` (ai 4.x) checks `body.messages` with `z.array(coreMessageSchema)` in setup mode | `export const POST = withBodyLimit(handleChatTurn)`, ahead of auth |
| `/api/auth/sign-in` (POST) | No (`{ email }`, a `typeof` check) | None |
| `/api/telegram/webhook` (POST) | No (grammY, secret header) | None |
| `/api/inngest` (GET, POST, PUT) | The SDK parses with Zod, but only after its signature check | None |
| `/api/dev-smoke`, `/auth/callback`, `/auth/sign-out` | No | None |
| `middleware.ts` | No (refreshes the session cookie; never reads the body) | None |
No server actions (`"use server"`) exist.

## Limit
- `MAX_REQUEST_BODY_BYTES` = 1 MiB (1,048,576 bytes), one constant in apps/web/server/http/body-limit.ts.
- Largest legitimate tRPC request, measured (verified, test/body-limit.test.ts): a spec save at every schema maximum, every character a 3-byte UTF-8 character, sent as a batch of three = 202,258 bytes (one save about 67 KB). Margin: 5.2x for the batch, about 15x for one save.
- Largest legitimate chat request (inferred, no production data read): `useChat` sends the whole thread every turn, and manage threads grow without bound (the server caps what it forwards at 20, the client does not). A typical exchange is about 1 to 2 KB; a sample preview carries its markdown (at most about 28 KB at the composer schema maxima, a few KB in practice). 1 MiB holds several hundred exchanges or about 35 maximum-size previews. The tRPC side alone would allow a far smaller limit; chat sets it.
- Heap under the limit (verified, zod 3.25.76, `[0,0,…]` against a `.max(366)` array): 58 MB at 256 KiB, 180 MB at 1 MiB, 643 MB at 4 MiB.

## Arrays bounded
- `cadence.weekdays` (daily) and (weekly) in apps/web/lib/scheduling/rule.ts: `.max(7)`, seven ISO weekdays.
- `skipDates`: `.max(366)`, one year of daily skips; beyond that `endDate` or pausing is the tool. Nothing in the app writes `skipDates` today.
- Every other `z.array` in apps/web already has `.max()` (digest spec, composer, extractor, the two `specIds` inputs). The two config-agent tool arrays (`ask_user`, `suggest_quick_replies`) are model output, not caller input.

## Builder decisions
- Guard placement in the tRPC route file, despite its "no auth or logging here" note (verified): it must run before tRPC reads the body, and `createTRPCContext` and procedure middleware run after that read. A size bound is neither auth nor logging; the header comment now says so.
- Chat guard runs before auth (verified by test): no behaviour change under the limit; an over-limit request gets 413 instead of 401 or 429.
- One wrapper for both routes, rebuilding a `Request` from the bytes read (verified by test: same method, URL, headers and body).
- The 413 body is `{ error, code: "payload_too_large", userMessage }` so the chat client's existing envelope parser shows the message without a client change (inferred from chat-client.tsx; not run in a browser). It is not a transient code, so no auto-retry.
- 413 message (COPY_GUIDE §6–7, errors speak as "we"): "That was too much to send at once. Nothing was saved — try again with less." (verified: true at both entry points, the guard runs before any write).
- `.max()` added for correctness; it is not the memory bound on zod 3 (inferred from the zod source and decision 0013).

## What the guard does not cover
- Up to about 180 MB of heap per request under 1 MiB; concurrent requests on one instance add up.
- Entry points without a Zod parse (table above) read their bodies unbounded.
- A thread whose full transcript passes 1 MiB will get 413 on every turn. Capping what `useChat` sends would remove that risk and allow a lower limit; that is a client change outside this brief.
