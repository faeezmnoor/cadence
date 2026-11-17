<!-- layer: records · status: record · verified: 2026-11-17 -->
# Review round 2: 005-zod-guard (security and correctness lane)

Range: the fix round `08ffdca..faee67c` on `slice/005-zod-guard`, and the files it touches. Fresh reviewer, independent of both earlier records. No tracked file was changed. Probes and planted defects ran in a detached scratch worktree, which has since been removed. Model stubbed with `MockLanguageModelV1`; no provider call; no `.env*` read.
Versions: Node 26.8.1 on an arm64 Mac, zod 3.25.76, ai 4.3.19, @trpc/server 11, superjson as locked. Peak memory is `process.resourceUsage().maxRSS`, one fresh process per case, heap cap raised to 16 GB so the full cost shows.

## Summary
- F1 (chat) is closed. Nothing I could build that the shape check accepts went above 269 MB, and real client shapes pass.
- F2 (tRPC) is not closed. The 384 KiB limit assumes every byte of the body is parsed once. superjson, the tRPC transformer, honours `meta.referentialEqualities` on caller input. That lets one array in the body sit at nine array fields of `digestSpecSchema` at once, so Zod walks it nine times. One signed-in request under the limit then peaks at **2,225 MB**, above the 2 GB default function memory. That is the exact outcome the slice exists to prevent.
- F3 to F7 and the round-1 delete list are fixed, except that gate G10 points at the wrong record (P3).
- Full verification passes: 1315 passed and 25 skipped. Audit exit 0, standard check 0 FAIL. The builder's plant.sh catches 25 of 25 defects, and I caught 9 of my 9.

## Findings (severity × confidence)
| # | Sev | Conf | Finding | Reproduce | Fix |
|---|---|---|---|---|---|
| N1 | P0 | 90 | **tRPC: superjson shared references multiply the Zod work past the byte limit.** In `apps/web/server/trpc/trpc.ts:18` the transformer is plain `superjson`. Its `deserialize` applies `meta.referentialEqualities` from the caller, so a body can name one array once and place it at many schema positions. `digestSpecSchema` has nine array fields: topics, keywords include and exclude, companies, tickers, commodities, fx pairs, rss feeds and days of week. Each position builds its own issue for every element. The bounded formatter keeps the response at about 2 KB, but nothing bounds the parse. A protected procedure is enough to reach it, and any e-mail address can sign in. | Real `withBodyLimit` at 384 KiB, then the real `fetchRequestHandler`, `boundErrorShape` and `digestSpecSchema`, with `NODE_ENV=production`, on `updateRaw?batch=1`. The body is a 393,215-byte `spec.topics` array of `""`, and `meta.referentialEqualities` maps `spec.topics` to the other eight array paths. Result: 400, 1,440,429 issues, **peak RSS 2,225 MB**, 1.2 s. The same with `rss_feeds:[{},…]` as the shared array: 1,309,472 issues, 2,225 MB. Without the shared references the same byte budget measures 639–687 MB. | Override the transformer's input side on the server so it drops `meta.referentialEqualities` before `superjson.deserialize`; keep the output side as is. This loses no data: superjson writes the full value at every path in `json` and uses the annotation only to restore object identity. I checked this with a shared array plus a Date; the values round-trip. Add a test: the request above must stay near the plain-body figure, or the refusal must not depend on the annotation. Add this shape to `measure-trpc.mjs` (G14). |
| N2 | P3 | 95 | Gate G10 greps `docs/records/reviews/005-zod-guard-security.md`. That is the round-1 record, which says BLOCK and is not rewritten, so G10 can never pass. | `docs/slices/005-zod-guard/gates.md`, G10 row. | Point G10 at this file. |

Below the bar (noted, not scored). In setup mode a legitimate thread longer than 200 messages, or over 500 counted elements, gets the shape check's 400. The client renders that as "Something went wrong on our end. Tap retry", which is untrue, and Retry fails the same way every time. Setup intake is normally short, so this needs a very long unbound thread. Confidence 55.

## Dispatch questions
1. **F1: closed.** Every shape below was accepted by the check, then run through the real `streamText` (worst first):
   - 500 content parts whose `type` is a 2,000-character string: 269 MB. A failing literal echoes the received value, so the error string reached 23 M characters. The route's catch now logs 500 characters.
   - 200 messages with 2 bad parts each and 2.5 KB types: 254 MB.
   - 500 image parts with a nested object as `image`: 249 MB.
   - 500 file parts with an array `filename`: 176 MB.
   - 499 reasoning details with array signatures: 159 MB.
   - 40,000 uncounted `step-start` parts plus 500 tool parts on separate steps: 189 MB.
   - `parts: []` plus 20,000 `toolInvocations`: 115 MB. The SDK ignores `toolInvocations` once `parts` is present, which matches the check's counting.
   - A `"__proto__"` key carrying `providerOptions`: 111 MB. JSON.parse makes it an own key, `in` does not see it, and neither does Zod or the SDK's spread.
   - Non-object elements, `null` parts or content, and unknown roles are refused.
   - The builder's own G13 set measures 110–214 MB.

   Nothing that reaches Zod is parsed before the check. Before it, the route only reads the body as JSON, which the 1 MiB limit bounds. In manage mode only the last 20 messages reach `streamText`, and the other uses of `body.messages` (the persisted last turn, and the extractor's last five) never go to Zod.

   Real shapes are accepted:
   - a 200-message thread of text turns, plus assistant turns that carry each tool call in both `parts` and `toolInvocations` (151 KB, 132 MB);
   - an image attachment.
2. **F2: the builder's numbers are confirmed for a body parsed once.**
   - Measured: `rss_feeds` 686 MB in production and 687 MB unset; `topics` 417 MB; a GET at Node's header cap 118 MB.
   - The response is about 2 KB and carries no stack in production, development or unset, for Zod and non-Zod errors alike (a 100 KB thrown message comes back as 620 bytes).
   - Concurrent requests in one process: 1 at 652 MB, 2 at 1,092 MB, 3 at 1,485 MB, 4 at 1,846 MB. About five concurrent bad requests on one instance pass 2 GB.
   - **Residual.** About 650–690 MB for one request is acceptable against 2 GB for this slice's stated goal, once N1 is fixed. It is not acceptable while N1 stands.
   - **Rate limiting can be a follow-up.** A per-user limit does not stop one account firing five requests in parallel, or several free accounts. The real fixes are a per-instance concurrency or burst limit on tRPC mutations, or zod 4 (option A). Record it as a named follow-up on the roadmap row for option A.
3. **F3 to F7 and the delete list.**
   - F3: an errored stream reaches the route as the same error and gets the route's own 400, tested against the real tRPC handler.
   - F4: both limit values are pinned, and the abort signal, a socket-level chunked request and the errored stream are each tested.
   - F5: the client shows no Retry and does not auto-retry for `payload_too_large`, and it drops the unsent user message. The words are true, since a 413 is returned before auth and nothing is written.
   - F6: the notes are corrected and the route test posts to `briefs.updateRaw`.
   - F7: re-stamped at 81499b9; the later commits change only documents. G10 is the exception (N2).
   - Delete list: the `R` generic, the `console.info` and the duplicate `error` field are all gone.
   - GET inputs are bounded by the 16,384-byte header cap (118 MB measured). Shared references add at most a factor of two on `briefs.preview` (inferred, not measured).
4. **Verification.** `pnpm typecheck && pnpm lint && pnpm test`: exit 0. `pnpm audit --prod --audit-level=high`: exit 0. `bun .standard/standard-check.mjs .`: 0 FAIL, 2 WARN. plant.sh: 25 of 25 caught.

## Planted defects (reviewer's own; 9 planted, 9 caught, 0 survived)
Each was planted alone, the whole `apps/web` Vitest suite was run, and the file was restored from a saved copy.
| # | Defect | Result |
|---|---|---|
| R1 | `experimental_providerMetadata` no longer refused | caught |
| R2 | per-message element-cap check (content, attachments) removed | caught |
| R3 | content parts may carry `providerOptions` | caught |
| R4 | the route checks only the last 20 messages in every mode | caught |
| R5 | stack kept outside production | caught |
| R6 | every Zod issue returned in the error shape | caught |
| R7 | role `tool` allowed | caught |
| R8 | the unsent message is dropped whatever its role | caught |
| R9 | the catch logs the whole error message | caught |
The live finding N1 is a gap in the suite as well: no test sends a superjson `meta` annotation.

## Delete list
Nothing from the fix round. Every new piece is used by a fix or a gate.

## Not checked
- Production on Vercel. The measurements are local on Node 26, while production runs Node 22, and Fluid concurrency on one instance was not observed.
- The 413 and the 400 in a browser.
- Other superjson annotations (`values` types) beyond a reading of the behaviour. Nothing else amplified in my probes.
- The validator wave for N1 (P0) is still owed before the fix round.

VERDICT: BLOCK
