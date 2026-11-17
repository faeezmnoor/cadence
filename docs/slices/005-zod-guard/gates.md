<!-- layer: records · status: living (while open) -->
# 005 · zod-guard — gate ledger
Written before code. Only the gate-check script marks EVIDENCE by re-running CHECK. G9 and G10 are the closing pair: full verification at the final commit, and the review verdict. G11 to G15 were added before the fix round for the security review (docs/records/reviews/005-zod-guard-security.md, F1 to F7).

| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| G1 | `cd apps/web && npx vitest run test/body-limit.test.ts` | exit 0 | 53610c6 2026-11-14T04:32:15.967Z exit=0 |
| G2 | `cd apps/web && npx vitest run test/body-limit-routes.test.ts` | exit 0 | 53610c6 2026-11-14T04:32:16.938Z exit=0 |
| G3 | `cd apps/web && npx vitest run test/scheduling-rule-bounds.test.ts` | exit 0 | 53610c6 2026-11-14T04:32:17.367Z exit=0 |
| G4 | `bash docs/slices/005-zod-guard/plant.sh` | exit 0, output contains "all planted defects caught" | 53610c6 2026-11-14T04:32:20.724Z exit=0 |
| G5 | `pnpm audit --prod --audit-level=high` | exit 0 | 53610c6 2026-11-14T04:32:21.602Z exit=0 |
| G6 | `bun .standard/standard-check.mjs .` | exit 0 | 53610c6 2026-11-14T04:32:21.802Z exit=0 |
| G7 | `git diff --quiet main -- apps/web/COPY_GUIDE.md apps/web/components ':(exclude)apps/web/components/chat/chat-client.tsx'` | exit 0 | 53610c6 2026-11-14T04:32:21.809Z exit=0 |
| G8 | `pnpm install --frozen-lockfile && git diff --quiet main -- pnpm-lock.yaml apps/web/package.json package.json` | exit 0 | 53610c6 2026-11-14T04:32:22.256Z exit=0 |
| G9 | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | 53610c6 2026-11-14T04:32:30.540Z exit=0 |
| G10 | `grep -q '^VERDICT: APPROVE' docs/records/reviews/005-zod-guard-security.md` | exit 0 | |
| G11 | `cd apps/web && npx vitest run test/chat-message-shape.test.ts` | exit 0 | |
| G12 | `cd apps/web && npx vitest run test/trpc-error-format.test.ts` | exit 0 | |
| G13 | `node docs/slices/005-zod-guard/measure-chat.mjs` | exit 0, output contains "chat worst case under budget" | |
| G14 | `NODE_ENV=production node docs/slices/005-zod-guard/measure-trpc.mjs` | exit 0, output contains "trpc worst case under budget" | |
| G15 | `cd apps/web && npx vitest run test/chat-error-actions.test.ts` | exit 0 | |

- G1: the bounded reader. Each limit's exact value; over-limit bodies with an honest `Content-Length`, a lying one, none, and a real `Transfer-Encoding: chunked` request over a socket all return 413 and stop reading at the limit; a body exactly at the limit passes byte for byte; the abort signal reaches the handler; a body stream that errors mid-read reaches the handler as the same read error (the route's own 400), never a partial body.
- G2: the two Zod-parsing entry points (tRPC, chat) answer 413 before the router or the auth step is reached at their own limits, pass an at-limit body through unchanged, and give the pre-guard 400 when the stream errors.
- G3: `.max()` on `weekdays` (daily and weekly) and `skipDates`, and the memory-shape test (the parser is never handed the oversized array).
- G4: plants each defect the guards guard against, runs the matching test, requires it to fail, restores the file. Includes the four review survivors: dropped abort signal, limit raised to 4 MiB, guard skipped on `Transfer-Encoding`, stream error swallowed.
- G7: no UI component or copy guide change except chat-client.tsx (F5: no Retry on a 413, the unsent message dropped); the 413 words live in apps/web/server/http/body-limit.ts.
- G8: no dependency change.
- G10: the security lane's verdict, at the real review path (F7).
- G11: the hand-written chat message shape check (F1): every rejected shape, a long legitimate thread accepted, the caps' exact values.
- G12: the tRPC error formatter (F2): at most 20 issues plus a count, no stack in any environment, long messages cut.
- G13: the worst payload the chat shape check accepts, run through the real `streamText` with a mock model, stays under 300 MB peak RSS.
- G14: the worst tRPC body at the tRPC limit, through the real `fetchRequestHandler` and the bounded formatter in production mode, stays under 600 MB peak RSS; also measures the largest GET the platform lets through.
- G15: the chat client offers no Retry for a 413 and drops the unsent message, so "try a shorter one" is true.
