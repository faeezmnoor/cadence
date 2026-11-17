<!-- layer: records · status: record · verified: 2026-11-17 -->
# Validator: 005-zod-guard security round 2, finding N1

Scope: confirm or refute N1 of `005-zod-guard-security-r2.md` by my own measurement, then three questions. Branch `slice/005-zod-guard` at `faee67c`. No tracked file changed; probes ran from a scratch script outside the repository. No network, no `.env*` read.
Setup: Node 26.8.1, arm64 Mac, zod 3.25.76, @trpc/server 11.13.0, superjson 2.2.6. `NODE_ENV=production`. Real `withBodyLimit` (384 KiB), real `fetchRequestHandler`, real `boundErrorShape`, real `digestSpecSchema` and `schedulingRuleV1`, in a stub router that mirrors `briefs.updateRaw` and `briefs.preview` without auth (the same method as `measure-trpc.mjs`). Peak is `process.resourceUsage().maxRSS`, one fresh process per case, heap cap 8–16 GB.

## N1: CONFIRMED
Payload: `POST /api/trpc/updateRaw?batch=1`, body `{"0":{"json":{"id":<uuid>,"spec":{"topics":["","",…],"entities":{"companies":0,"tickers":0,"commodities":0},"keywords_include":0,"keywords_exclude":0,"data_addons":{"fx_pairs":0},"rss_feeds":0,"cadence":{"days_of_week":0}}},"meta":{"referentialEqualities":{"spec.topics":[the other eight array paths]},"v":1}}}`, filled to the limit.

| Case | Body bytes | Status | Zod issues | Peak RSS |
|---|---|---|---|---|
| plain `topics:["",…]` | 393,215 | 400 | 131,048 | 357 MB |
| plain `rss_feeds:[{},…]` | 393,215 | 400 | 262,092 | 662 MB |
| shared `topics` at 9 paths | 393,214 | 400 | 1,439,945 | **2,227 MB** (1.2 s) |
| shared `rss_feeds` at 9 paths | 393,214 | 400 | 1,309,042 | **2,221 MB** |
| shared `topics`, `referentialEqualities` stripped server-side | 393,214 | 400 | 130,915 | 358 MB |

The proposed strip closes N1 as stated.

## New finding N3 (P0): the proposed fix is not enough
superjson's `setDeep` writes `array[index]` without checking the index, so any annotation whose path names an index past the end makes a sparse array of that length. `meta.values` does this as well as `referentialEqualities`; Zod 3 then spreads the array and builds one issue per hole. The byte limit does not apply, because the body is about 150 bytes.

| Case (referentialEqualities stripped unless noted) | Request | Peak RSS |
|---|---|---|
| `{"json":{"id":…,"spec":{"topics":[]}},"meta":{"values":{"spec.topics.2000000":["undefined"]},"v":1}}`, batch | 143 B | **2,254 MB**, 2,000,004 issues, 1.5 s |
| same, non-batch | 137 B | 2,255 MB |
| same at index 3,000,000 | 143 B | no answer in 150 s, 3,460 MB at kill |
| `GET preview?batch=1&input=` with `values` on `rule.skipDates.2000000` | 248 B URL | 2,259 MB (ZodError.message built for the TRPCError) |
| `referentialEqualities` `{"spec.topics":["spec.topics.2000000"]}`, not stripped | 154 B | 2,247 MB |

Reach: any signed-in caller, any procedure whose input reaches a Zod array (`briefs.updateRaw`, `digestSpec.updateRaw`, `briefs.preview` via `z.unknown`, the `specIds` queries). The one public procedure with input (`getByShortId`) has no array. Inferred, not measured end to end: `chat.appendMessage` stores `content: z.unknown()` as jsonb, so an 82-byte `values` annotation becomes a 100 MB JSON value (index 20 M), and a 1.6 KB `referentialEqualities` chain becomes 33 MB (depth 22; doubles per level).

## Answers
(a) **The real client loses nothing.** `lib/trpc/provider.tsx` uses the default `superjson` (dedupe off), which writes the full value at every path and only adds identity in `referentialEqualities`. Shared array, shared object plus Date, `undefined` field, Map plus Set, and the three shared empty `entities` arrays all round-trip identically with the annotation dropped. Every `values` path the client emits names a key that exists in `json` (undefined is sent as `null` with an annotation).
(b) Worst found: N3, about 2.25 GB from a 143-byte body, unbounded with the index (3 M did not finish). `typed-array` (`new Float64Array(1e9)`) is allocated but never touched: 125 MB. `class`, `custom` and `symbol` throw (nothing is registered). `map` and `set` are linear in bytes.
(c) In the server transformer's `input.deserialize` in `apps/web/server/trpc/trpc.ts` (`transformer: { input: { serialize, deserialize: guarded }, output: superjson }`). tRPC 11 calls `transformer.input.deserialize` once per call for batch and once for non-batch, for GET and POST, in the JSON content-type parser. The guard must drop `referentialEqualities` and refuse (400) any `values` path that does not resolve to an existing own key in the raw `json` (an array index must be below the length), plus an allowlist of annotation types (`undefined`, `Date`, `bigint`, `map`, `set`). Not `withBodyLimit`: it sees bytes only.

## Tests owed
A route test for each of: the N1 body, the 143-byte `values` body (batch and non-batch), and the GET `preview` form, each expecting a fast 400 with a small peak. Add both shapes to `measure-trpc.mjs` (G14).

## Not checked
Real auth middleware and database; Vercel (Node 22, Fluid concurrency); FormData and octet-stream inputs (they bypass the transformer); planted defects (out of scope for a validator).

VERDICT: BLOCK
