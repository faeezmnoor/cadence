<!-- layer: records · status: living (while open) -->
# 005 · zod-guard — gate ledger
Written before code. Only the gate-check script marks EVIDENCE by re-running CHECK. G9 and G10 are the closing pair: full verification at the final commit, and the review verdict. G11 to G15 were added before the fix round for the security review (docs/records/reviews/005-zod-guard-security.md, F1 to F7). G16 was added before the second fix round for review round 2 and its validator (docs/records/reviews/005-zod-guard-security-r2.md and -r2-validator.md, N1 to N3).

| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| G1 | `cd apps/web && npx vitest run test/body-limit.test.ts` | exit 0 | 8824988 2026-11-17T09:19:39.512Z exit=0 |
| G2 | `cd apps/web && npx vitest run test/body-limit-routes.test.ts` | exit 0 | 8824988 2026-11-17T09:19:40.351Z exit=0 |
| G3 | `cd apps/web && npx vitest run test/scheduling-rule-bounds.test.ts` | exit 0 | 8824988 2026-11-17T09:19:40.802Z exit=0 |
| G4 | `bash docs/slices/005-zod-guard/plant.sh` | exit 0, output contains "all planted defects caught" | 8824988 2026-11-17T09:20:16.832Z exit=0 |
| G5 | `pnpm audit --prod --audit-level=high` | exit 0 | 8824988 2026-11-17T09:20:17.830Z exit=0 |
| G6 | `bun .standard/standard-check.mjs .` | exit 0 | 8824988 2026-11-17T09:20:18.135Z exit=0 |
| G7 | `git diff --quiet main -- apps/web/COPY_GUIDE.md apps/web/components ':(exclude)apps/web/components/chat/chat-client.tsx'` | exit 0 | 8824988 2026-11-17T09:20:18.147Z exit=0 |
| G8 | `pnpm install --frozen-lockfile && git diff --quiet main -- pnpm-lock.yaml apps/web/package.json package.json` | exit 0 | 8824988 2026-11-17T09:20:18.656Z exit=0 |
| G9 | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | |
| G10 | `grep -q '^VERDICT: APPROVE' docs/records/reviews/005-zod-guard-security-r3.md` | exit 0 | |
| G11 | `cd apps/web && npx vitest run test/chat-message-shape.test.ts test/chat-route-shape.test.ts` | exit 0 | 8824988 2026-11-17T09:24:56.411Z exit=0 |
| G12 | `cd apps/web && npx vitest run test/trpc-error-format.test.ts` | exit 0 | 8824988 2026-11-17T09:24:58.235Z exit=0 |
| G13 | `node docs/slices/005-zod-guard/measure-chat.mjs` | exit 0, output contains "chat worst case under budget" | 8824988 2026-11-17T09:25:06.655Z exit=0 |
| G14 | `NODE_ENV=production node docs/slices/005-zod-guard/measure-trpc.mjs` | exit 0, output contains "trpc worst case under budget" | 8824988 2026-11-17T09:25:14.236Z exit=0 |
| G15 | `cd apps/web && npx vitest run test/chat-error-actions.test.ts` | exit 0 | 8824988 2026-11-17T09:25:16.021Z exit=0 |
| G16 | `cd apps/web && npx vitest run test/trpc-input-guard.test.ts` | exit 0 | 8824988 2026-11-17T09:25:18.816Z exit=0 |

- G1: the bounded reader. Each limit's exact value; over-limit bodies with an honest `Content-Length`, a lying one, none, and a real `Transfer-Encoding: chunked` request over a socket all return 413 and stop reading at the limit; a body exactly at the limit passes byte for byte; the abort signal reaches the handler; a body stream that errors mid-read reaches the handler as the same read error (the route's own 400), never a partial body.
- G2: the two Zod-parsing entry points (tRPC, chat) answer 413 before the router or the auth step is reached at their own limits, pass an at-limit body through unchanged, and give the pre-guard 400 when the stream errors.
- G3: `.max()` on `weekdays` (daily and weekly) and `skipDates`, and the memory-shape test (the parser is never handed the oversized array).
- G4: plants each defect the guards guard against, runs the matching test, requires it to fail, restores the file. Includes the four review survivors: dropped abort signal, limit raised to 4 MiB, guard skipped on `Transfer-Encoding`, stream error swallowed.
- G7: no UI component or copy guide change except chat-client.tsx (F5: no Retry on a 413, the unsent message dropped); the 413 words live in apps/web/server/http/body-limit.ts.
- G8: no dependency change.
- G10: the security lane's verdict, at the record of the review round that will carry the final verdict, round 3 (F7, N2). Rounds 1 and 2 said BLOCK and are not rewritten.
- G11: the hand-written chat message shape check (F1): every rejected shape, a long legitimate thread accepted, the caps' exact values; a setup thread over a cap gets the `thread_too_long` envelope with its own words.
- G12: the tRPC error formatter (F2): at most 20 issues plus a count, no stack in any environment, long messages cut.
- G13: the worst payload the chat shape check accepts, run through the real `streamText` with a mock model, stays under 300 MB peak RSS.
- G14: the worst tRPC body at the tRPC limit (384 KiB), through the real `fetchRequestHandler` and the bounded formatter in production mode, stays under 750 MB peak RSS (measured about 685 MB; the ~600 MB target needs a limit under the 1.5x margin, recorded in notes.md); also measures the largest GET Node lets through, and the three round-2 attack shapes (N1: shared references at nine array paths; N3: a 143-byte `values` annotation at index 2,000,000, and the same by GET on `preview`), which must be refused cheaply.
- G15: the chat client offers no Retry for a 413 and drops the unsent message, so "try a shorter one" is true; no Retry for `thread_too_long` either.
- G16: the tRPC input guard (N1, N3): `meta.referentialEqualities` dropped; every `meta.values` path must name an existing own key or in-range index of the raw `json`; only the allowed annotation types; at most the annotation cap; each attack shape refused through the real handler before Zod runs; real client shapes round-trip.
