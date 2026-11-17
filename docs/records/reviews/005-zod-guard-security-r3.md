<!-- layer: records · status: record · verified: 2026-11-17 -->
# Review round 3: 005-zod-guard (security and correctness lane)

Range: `faee67c..906fed8` on `slice/005-zod-guard` and the files it touches. Fresh reviewer, independent of the earlier records. No tracked file was changed; probes ran from scripts in the session scratch directory, planted defects in a detached scratch worktree (since removed with a plain `git worktree remove`). Model stubbed; no provider call; no `.env*` read.
Versions: Node 26.8.1 on an arm64 Mac, zod 3.25.76, @trpc/server 11.13.0, @trpc/client as locked, superjson 2.2.6. Peak memory is `process.resourceUsage().maxRSS`, one fresh process per case, `NODE_ENV=production`, heap cap 16 GB.

## Summary
- N1 and N3 are closed. No request I could build gets past the input guard with a value larger than its raw `json`, and the worst accepted request is still the plain 384 KiB body at about 685 MB.
- N2 is closed: G10 points at this file.
- The setup-chat `thread_too_long` change is correct: true words, no Retry, manage mode unchanged.
- One new finding (P2): the guard itself can be made to spend about 7 s of CPU on one 384 KiB request. Memory stays at 300–454 MB, so the slice's goal holds; it is a follow-up, not a block.
- The residual (about 685 MB per request; about five concurrent worst-case requests pass 2 GB) is acceptable to ship now. Production today has no body limit and no guard, so one request can exhaust an instance; this branch needs about five at once. It is a strict improvement. The burst or concurrency limit on the roadmap is the right next step and should also cover the CPU finding below.

## Findings (severity × confidence)
| # | Sev | Conf | Finding | Reproduce | Fix |
|---|---|---|---|---|---|
| R3-1 | P2 | 90 | **The guard's own bookkeeping is quadratic for long paths.** `annotate` in `apps/web/server/trpc/input-guard.ts:136-140` checks and stores `JSON.stringify(path…)` strings in the `applied` Set. V8 hashes strings longer than 16,383 characters by length alone, so when every annotation path is long and the same length, each lookup compares against every stored path. Depth and key caps do not bound path characters. | A batch body for any signed-in mutation: `json` holds one object chain of two ~93,000-character keys ending in an array of 997 `null`s; `meta.values` repeats the chain with an `["undefined"]` annotation for each index 0–996 (`v: 1`). 384–397 KB. The guard alone takes 6.6–7.3 s (depths 2, 10, 20, 60, or one long segment plus 61 short ones all measure the same); superjson alone on the same payload takes 5 ms. Through the real handler: status 200 on a `z.unknown()` input, 6.3–6.8 s, peak 342–454 MB. The same shape with 8,000-character segments takes 13 ms. Not reachable signed out (auth runs before the input is read) or by GET (16 KB URL, under the hash threshold). | Cap path characters, for example at most 256 characters per segment and 1,024 per path (real paths are about five short segments), refused like the depth cap; or track applied nodes by object identity instead of stringified paths. Add a timing test for this shape. |
| R3-2 | P3 | 95 | Two guard rules have no test of their own: an invalid path escape, and `constructor` or `prototype` as a segment. Planted defects removing either survive (P7, P13 below). superjson refuses both itself (`parsePath` throws "invalid path"; `validatePath` throws on all three names), so the request still gets a 400, with superjson's message instead of "Invalid input encoding". | Plants P7 and P13. | One test each through `guardTrpcInput`, expecting the guard's message. |

Below the bar (not scored): a client value of `-0`, `NaN` or `±Infinity` in a number input is now refused as "Invalid input encoding" (superjson annotates it as `number`) instead of reaching Zod. No client call site computes such a value (the numeric inputs are constants), so no real request changes.

## Dispatch questions
1. **The input guard, attacked.** Every case below went through the real `withBodyLimit` (384 KiB), the real `fetchRequestHandler`, the real `trpcTransformer` and `boundErrorShape`, against the real `digestSpecSchema` and `schedulingRuleV1`, in a stub router that mirrors `briefs.updateRaw`, `chat.appendMessage` (`content: z.unknown()`) and `briefs.preview` without auth.

   | Case | Bytes | Result | Peak |
   |---|---|---|---|
   | `rss_feeds:[{},…]` batch (worst accepted) | 393,215 | 400, 262,092 issues | 672–685 MB |
   | same, non-batch / content type `application/jsonx; charset=utf-8` | 393,215 | 400 | 673 / 672 MB |
   | batch of 2 halves / of 200 items | 393,213 / 392,891 | 400 | 612 / 537 MB |
   | `tickers:["",…]` (2 issues per element) | 393,214 | 400 | 482 MB |
   | 1,000 `bigint` annotations (64 digits) plus `rss_feeds` filler | 366,010 | 400 | 545 MB |
   | 999 `set` annotations on `rss_feeds` elements plus filler | 388,970 | 400 | 314 MB |
   | N1 shared `topics` at nine paths | 393,214 | 400, parsed once | 335–352 MB |
   | N3 `values` at index 2,000,000 (POST, GET `preview`, `referentialEqualities` form) | 143–248 | guard 400 | 111–112 MB |
   | `1e6`, escaped-dot key naming a missing key | 173 | guard 400 | 111 MB |
   | `__proto__` key carrying `rss_feeds` | 393,214 | 400, 3 issues | 128 MB |
   | no `json` wrapper | 393,215 | 400, 1 issue | 127 MB |
   | 190,000-deep nesting in `appendMessage` content | 380,091 | 400 (stack overflow in superjson's copy, caught) | 138 MB |
   | multipart form-data (skips the transformer) | 393,056 | 400, 2 issues | 119 MB |
   | GET `preview` `skipDates:[0,…]` at 16 KB / with `set` annotations | 15,979 / 15,653 | 400 | 123 / 114 MB |
   | R3-1 long-path annotations | 393,119 | 200 after 6.3–6.8 s | 342–454 MB |

   - Differential fuzz: 550,000 generated payloads (random `json`; `values` trees in object and array form, escaped and unescaped keys, non-canonical indexes, `length`, prototype names, every annotation type, map and set children, overlapping and duplicate paths). 28,216 were accepted; for every one, the deserialised value had no array longer and no more nodes than its raw `json`, and superjson never threw after acceptance.
   - Coverage: tRPC 11.13 calls `transformer.input.deserialize` only in the JSON content-type handler, once per call for batch and non-batch, for GET and POST. Form-data and octet-stream skip it and reach Zod as a non-plain value (one or two issues, measured). Any other content type gets 415. `allowMethodOverride` is off, so a query by POST is refused before its input is read. There are no subscriptions and no other `initTRPC` or caller-input `superjson.deserialize`. Auth middleware runs before the input is read, so a signed-out caller never reaches the guard.
   - Worst peak: about 685 MB, the plain `rss_feeds` body, unchanged from the builder's figure.
2. **Real client shapes.** Through the real `@trpc/client` `httpBatchLink` with `superjson` into the guarded server, 13 of 13 inputs arrive unchanged: a full `updateRaw` spec at every maximum, `appendMessage` user and assistant turns, undefined fields (including inside arrays and under keys with `.` and `\`), Date, bigint, Map and Set with shared references, undefined input on a mutation and on a GET query, an optional-object query, a three-call batch and a no-input query.
3. **Setup chat `thread_too_long` (308dda0).** Correct. Setup mode over either cap answers `400 {code: "thread_too_long", userMessage}`; `useChat` surfaces the body as the error message and the client shows `userMessage` with no Retry (`offersRetry`). The words are true: the setup header renders a "Start over" control whenever the thread is not a manage thread. Manage mode keeps `{error: "bad request"}` (tested).
4. **Chat route.** The shape check is unchanged since round 2; the diff only adds the setup-mode envelope. G13 re-run: worst accepted chat payload 215 MB (round 2's longer-type-string variant measured 269 MB on the same code).
5. **Verification.** `pnpm typecheck` 0; `pnpm lint` 0; `pnpm test` 1,373 passed, 25 skipped, 0 failed; `pnpm audit --prod --audit-level=high` 0; `bun .standard/standard-check.mjs .` 0 FAIL, 2 WARN; G13 and G14 pass (685 MB under 750). `plant.sh`, run inside the scratch worktree: 41 of 41 caught.

## Planted defects (reviewer's own; 13 planted, 11 caught, 2 survived)
Each was planted alone in the scratch worktree, the four guard and chat test files were run, and the file was restored from a saved copy.
| # | Defect | Result |
|---|---|---|
| P1 | escaped dot treated as a separator (guard path differs from superjson's) | caught |
| P2 | index regex lacks its end anchor (lookalike) | caught |
| P3 | Date length cap dropped | caught |
| P4 | bigint pattern unanchored | caught |
| P5 | an annotation on the same node twice not refused | caught |
| P6 | index equal to the length accepted (off by one) | caught |
| P7 | invalid path escape accepted | **survived** (R3-2) |
| P8 | map entries not checked as pairs | caught |
| P9 | `too_many_elements` dropped from the thread-length reasons | caught |
| P10 | a non-object `meta` passed through | caught |
| P11 | tree node of three elements accepted | caught |
| P12 | node annotated before its children | caught |
| P13 | `constructor` dropped from the forbidden segments | **survived** (R3-2) |

## Delete list
- `Date`, `bigint`, `map` and `set` in `ALLOWED_INPUT_ANNOTATIONS`, with their raw-shape branches, `MAX_SCALAR_ANNOTATION_CHARS` and `BIGINT_TEXT`: no procedure input takes them and the client sends only `undefined`. Optional; each is linear in bytes, so keeping them costs only surface.
- Nothing else.

## Not checked
- Vercel itself (Node 22, Fluid concurrency, the real function memory and duration limits); measurements are local on Node 26.
- Concurrent requests: not re-measured; round 2's figures stand (four at once 1,846 MB).
- The real `appRouter` with auth and database: the stub router uses the real transformer, formatter, body limit and schemas; the wiring in `trpc.ts` was read and is exercised by the builder's tests through the real `router`.
- The `thread_too_long` bubble in a browser.
- The notes.md verdict line: the dispatch made tracked files read-only, so it was not appended.

VERDICT: APPROVE
