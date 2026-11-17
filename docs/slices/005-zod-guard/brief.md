<!-- layer: knowledge · status: living (while open) · verified: 2026-11-13 · budget: 200 lines -->
# 005 · zod-guard — brief (context pack)
Status: BUILD. Tier: A (security; merging to main deploys production). Branch slice/005-zod-guard off main.

## Why
Decision 0013 (docs/decisions/0013-zod-advisory-exception.md, read it first) left the Zod memory advisory GHSA-mrhx-c7xc-m3w5 open: on zod 3.25.76 an array check builds one issue object per bad element even after `.max()` is breached, so one large request from any signed-in account can exhaust a function instance (measured: a 4 MB body, about 690 MB of heap). The owner ruled on 2026-11-13: option B now (a size guard), option A (zod 4 with AI SDK 5) later as its own slice.

## Scope
1. A request-size guard that runs before any Zod parse of caller-controlled input on every HTTP entry point that parses with Zod. Start from `apps/web/app/api/trpc/[trpc]/route.ts` (the single tRPC entry) and check `apps/web/app/api/chat/route.ts` and `apps/web/app/api/auth/sign-in/route.ts`; list every entry point and what you found in notes.md. The guard rejects with 413 before the body is parsed, must not trust `Content-Length` alone (a chunked or lying request must still be bounded while reading), and must not break the largest legitimate request (find it: chat messages, spec saves; record the measured size and the chosen limit with its margin in notes.md). One shared helper, one constant.
2. Bound the arrays decision 0013 names as unbounded: `skipDates` and `weekdays` in apps/web/lib/scheduling/rule.ts, and any other caller-reachable `z.array` without `.max()` that you find (list them). Choose limits from the domain (seven weekdays; skip dates by a stated reason).
3. Tests first: a failing test that sends an oversized body and expects 413 without the router being reached; a test that a body just under the limit passes; a test with no `Content-Length`; a memory-shape test at the unit level showing the parser is never handed the oversized array. Schema tests for the new `.max()` values.
4. Decision 0013: status accepted, outcome "B now, A later", what the guard bounds and what it does not, the exception in pnpm-workspace.yaml stays (the audit still reports the package) with the review date moved to the zod 4 slice. docs/OWNER-QUEUE.md: OQ-11 leaves the table. docs/roadmap.md: a row for the zod 4 with AI SDK 5 slice (needs the G-eval number, decision 0012).
5. gates.md written first; notes.md with builder decisions.

## Gates
`pnpm typecheck && pnpm lint && pnpm test` exit 0; `pnpm audit --prod --audit-level=high` still exit 0; `bun .standard/standard-check.mjs .` 0 FAIL; no user-facing string added except the 413 message, which follows apps/web/COPY_GUIDE.md.

## Do not
Push, open a pull request, deploy, read any `.env*` file, touch secrets, change dependencies, or change behaviour for requests under the limit. Stop and report if the guard cannot sit in front of an entry point without a wider change.

## Report (≤ 250 words)
Entry points and where the guard sits; the limit and the measured largest legitimate request; arrays bounded with limits; tests added and counts; verification results; what the guard does not cover.
