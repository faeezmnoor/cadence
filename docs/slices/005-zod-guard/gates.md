<!-- layer: records · status: living (while open) -->
# 005 · zod-guard — gate ledger
Written before code. Only the gate-check script marks EVIDENCE by re-running CHECK. G9 and G10 are the closing pair: full verification at the final commit, and the review verdict.

| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| G1 | `cd apps/web && npx vitest run test/body-limit.test.ts` | exit 0 | 8cd2da9 2026-11-13T16:28:13.647Z exit=0 |
| G2 | `cd apps/web && npx vitest run test/body-limit-routes.test.ts` | exit 0 | 8cd2da9 2026-11-13T16:28:14.574Z exit=0 |
| G3 | `cd apps/web && npx vitest run test/scheduling-rule-bounds.test.ts` | exit 0 | 8cd2da9 2026-11-13T16:28:15.016Z exit=0 |
| G4 | `bash docs/slices/005-zod-guard/plant.sh` | exit 0, output contains "all planted defects caught" | 8cd2da9 2026-11-13T16:28:18.190Z exit=0 |
| G5 | `pnpm audit --prod --audit-level=high` | exit 0 | 8cd2da9 2026-11-13T16:28:19.066Z exit=0 |
| G6 | `bun .standard/standard-check.mjs .` | exit 0 | |
| G7 | `git diff --quiet main -- apps/web/components apps/web/COPY_GUIDE.md` | exit 0 | 8cd2da9 2026-11-13T16:28:19.295Z exit=0 |
| G8 | `pnpm install --frozen-lockfile && git diff --quiet main -- pnpm-lock.yaml apps/web/package.json package.json` | exit 0 | 8cd2da9 2026-11-13T16:28:19.731Z exit=0 |
| G9 | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | 8cd2da9 2026-11-13T16:28:27.605Z exit=0 |
| G10 | `grep -q '^VERDICT:' docs/slices/005-zod-guard/review.md` | exit 0 | |

- G1: the bounded reader. Over-limit body with an honest `Content-Length`, with a lying one, and with none (chunked stream) all return 413 and stop reading at the limit; a body just under the limit passes byte for byte; the max-bound spec save fits with margin.
- G2: the two Zod-parsing entry points (tRPC, chat) answer 413 before the router or the auth step is reached, and pass an under-limit body through unchanged.
- G3: `.max()` on `weekdays` (daily and weekly) and `skipDates`, and the memory-shape test (the parser is never handed the oversized array).
- G4: plants each defect the guards guard against (Content-Length-only guard, unwrapped tRPC route, unwrapped chat route, removed `.max()`), runs the matching test, requires it to fail, restores the file.
- G7: no user-facing string added outside the one 413 message (no UI component or copy guide change).
- G8: no dependency change.
