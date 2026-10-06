# STATE — Cadence
<!-- layer: state · status: living · budget: 80 lines -->
verified: 2026-10-06 at 146c495 by bun .standard/standard-check.mjs . (exit 0 at the next commit), pnpm typecheck && pnpm lint && pnpm test (exit 0, 1224 tests), CI run 37481884290 green on main 001508c, Vercel production deployment of 001508c successful

## Now
- Production (Vercel, from main 001508c, 2026-10-06): chat configuration, Telegram linking and delivery, feedback and weekly distillation, the credit ledger with admin grants and refunds.
- main 001508c (2026-10-06, slice 002): CI test-path fix and dependency security patches (Next.js 15.5.27, transitive overrides in pnpm-workspace.yaml); CI green including `pnpm audit --prod --audit-level=high`.
- Not live: card checkout (no Stripe integration in code); Advanced research paused behind `PRO_TIER_ALPHA` (decision 0009); Custom mode deferred (decision 0010).
- Built, not merged: slice 001-adopt-standard on branch slice/001-adopt-standard — documents on house standard 1.2.2 (tier standard), 16 agents and 5 skills archived for the shared plugin, CI job `standard-check`.
- Linear CAD (export 2026-10-06): 4 In Progress, none updated since June; 18 Todo.

## Next
1. 001-adopt-standard — review lanes, PR, branch protection on `check` and `standard-check` (waits on: reviewers, orchestrator)
2. Triage CAD-222, CAD-215, CAD-216, CAD-210 (waits on: owner, OQ-05)
3. CAD-70 to CAD-72 — config-agent tasks, Urgent (waits on: triage)
4. CAD-228 — Standard web-search default chosen by eval (waits on: nothing)

## Blocked
- Nightly database backup: fails every run since at least 2026-10-02; Actions secret `DATABASE_URL` unset (OQ-02).
- Telegram webhook secret: exposed in git history until rotated (OQ-01).
- Checkout: Stripe Malaysian KYC (OQ-07). Advanced: lead +0.26 against the 0.5 gate, needs owner ratings (OQ-06).
- main has no branch protection (verified 2026-10-06; set at T064).
- Reported: code and tests carry the owner's contact values; documents are redacted, code is not (OQ-10).

## Direction in force
- Prove the brief before charging: dogfood bar and the Advanced eval gate come before checkout and public signup (decisions 0009, 0012).
- Lead with the value, never the channel; credits only; "brief" is the noun (decisions 0001, 0002, 0003, 0005, 0010).

## Owner items
see docs/OWNER-QUEUE.md

## Measurements
<!-- filled by the orchestrator at CLOSE from the harness figures; builders leave this table alone -->
| Slice | Builder tokens | Reviewer tokens | Fix rounds |
| --- | --- | --- | --- |
| 001-adopt-standard | | | |
Owner minutes this week: not recorded. Last cold-start test: not run.
