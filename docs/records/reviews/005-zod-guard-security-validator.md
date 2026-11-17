# 005-zod-guard · security lane · validator wave

Scope: confirm or refute F1 and F2 of the first security review by measurement only. Base: branch slice/005-zod-guard at 08ffdca. Versions: ai 4.3.19, zod 3.25.76, @trpc/server 11.13.0, Node 26 on an arm64 Mac. Model stubbed with `MockLanguageModelV1`; no network, no `.env*` read, no tracked file changed. Scripts lived in a session scratch directory and are not committed. Peak memory = `maximum resident set size` from `/usr/bin/time -l`, run with `--max-old-space-size=16384` so the full cost is visible instead of an early crash.

## F1 (P0), /api/chat to streamText: CONFIRMED

Method: the route's own checks (`threadId` truthy, `Array.isArray(messages)`), then `streamText({ messages: body.messages, ... })` exactly as in setup mode, plus `toDataStreamResponse`. `standardizePrompt` runs synchronously inside `streamText`. The Zod error is thrown into the route's `catch`, which then hands `err.message` to `log.error`.

| Payload shape (one message) | Body | Peak RSS | Wall / CPU |
|---|---|---|---|
| `{"role":"user","content":[0,0,…]}` | 4 KiB | 182 MB | 0.08 s |
| same | 64 KiB | 1.43 GB | 1.1 s / 1.5 s |
| same | 256 KiB | 2.73 GB | 4.6 s / 6.1 s |
| same | 1 MiB | 5.42 GB | 19.3 s / 24.4 s |
| `{"content":[0,…]}` (no role) | 1 MiB | 5.07 GB | 19.6 s |
| `{"role":"assistant","content":[0,…]}` | 1 MiB | 6.12 GB | 19.3 s |
| UI message `{"role":"user","content":"","parts":[{"type":"text","text":0},…]}` | 1 MiB | 3.13 GB | 6.0 s |
| same, role assistant | 1 MiB | 3.35 GB | 5.7 s |
| many messages `[{"content":[]},…]` | 1 MiB | 1.12 GB | 1.0 s |

With a 1.5 GB heap cap the 1 MiB request ends the process (`JavaScript heap out of memory`). Below 64 KiB the error message alone is 11.7 M characters at 4 KiB, which then goes to the logger. Shapes that do not reach Zod: a non-object element (`messages:[0,…]`), a string content, an unknown role with string content (`detectPromptType` throws cheaply), and well-formed text parts (passed to the model, about 110 MB).

What the route rejects before streamText: only a missing `threadId` or a non-array `messages` (400), then the thread-ownership and gate checks (404/409). On the first setup turn, a last message with `role:"user"` whose stringified content splits into three or more comma-separated candidates may get a 422 from the multi-topic mirror. Leaving out the role, using `assistant`, or putting the bad message earlier in the array avoids it. No structural check exists. The byte limit cannot close this: 64 KiB already costs 1.4 GB.

Smallest check that closes it (hand-written, before streamText, in both modes): `messages` has at most 200 entries; each entry is a plain object with `role` in {user, assistant}; `content` is a string; `parts`, `toolInvocations`, `experimental_attachments` and array `content` are each arrays if present; the total count of their elements across the request is at most 500. Each `parts` element is an object with a string `type`, and a `text` part has a string `text`. Measured worst case near that cap: 1,000 bad elements cost 137 MB (content) and about 300 MB (text parts); 200 cost about 130 MB. A cap of 500 total elements keeps the cost under about 200 MB. Return 400 without echoing input.

## F2 (P1), /api/trpc through the real handler: CONFIRMED (magnitude depends on NODE_ENV)

Method: the real `fetchRequestHandler` behind the real `withBodyLimit`, the real `schedulingRuleV1` as input, and the same `initTRPC` options (superjson, pass-through `errorFormatter`). The auth middleware is stubbed to pass, so the procedure is never reached. Payload: `?batch=1`, `{"0":{"json":{"timezone":"UTC","cadence":{"kind":"daily"},"skipDates":[0,0,…]}}}`.

| Body | NODE_ENV=production RSS / response | non-production RSS / response |
|---|---|---|
| 128 KiB | 273 MB / 14.5 MB | 360 MB / 28.9 MB |
| 192 KiB | 369 MB / 21.7 MB | 504 MB / 43.4 MB |
| 256 KiB | 418 MB / 29.0 MB | 599 MB / 58.0 MB |
| 512 KiB | 719 MB / 58.1 MB | not run |
| 1 MiB | 1.28 GB / 116 MB | 1.96 GB / 233 MB |

The non-production run doubles because the stack, which repeats the message, is serialised. A body of 1 MiB + 1 byte got 413 at 107 MB, so the guard itself works.

Body limit for under 500 MB peak: about 256 KiB in production (418 MB), or 192 KiB counting non-production. The measured largest legitimate tRPC batch is 202,258 bytes, so 256 KiB leaves only a 1.3x margin. The shared 1 MiB constant is set by chat.

Truncating errorFormatter (message replaced, first 20 issues kept): response bounded to 2.8 KB at every size. Peak memory is not bounded: 801 MB at 1 MiB, 479 MB at 512 KiB, 297 MB at 256 KiB. Zod still builds every issue, and `ZodError.message` is still stringified when the TRPCError is built. Both are needed: the formatter for response size and a tRPC limit of at most 512 KiB (256 KiB preferred) for memory.

## Findings

- P0 apps/web/app/api/chat/route.ts:485: confirmed as above; fix by the hand-written shape check.
- P1 apps/web/app/api/trpc/[trpc]/route.ts:22 and server/trpc/trpc.ts:19: confirmed; fix with a truncating errorFormatter plus a smaller tRPC limit.

Not checked: the real Supabase or DB path, behaviour on Vercel itself, and every finding other than F1 and F2. The verdict line was not added to notes.md, because this dispatch is read-only on tracked files.

VERDICT: BLOCK
