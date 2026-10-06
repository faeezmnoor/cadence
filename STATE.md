# STATE — Cadence
<!-- layer: state · status: living · budget: 80 lines -->
verified: 2026-10-06 at 8afb459 by CI on PR #52 (check, standard-check, Vercel preview all green), production deployment success, two independent reviews over two rounds (correctness, hygiene: APPROVE)

## Now
- Adopted the house standard at Standard tier (PR #52, merged 2026-10-06): entry file, state, 13 decisions in MADR, architecture overview and generated schema, DESIGN.md phase one, lessons, two specialist agents plus the shared plugin, CI lint required on main.
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
| Slice | Planner tokens | Builder tokens | Reviewer tokens | Fix rounds |
| --- | --- | --- | --- | --- |
| 002-fix-ci | — | ~55k + ~63k + ~78k (test fix, audit scope, security patches) | ~83k + challenger ~74k | 0 |
| 001-adopt-standard | ~257k | ~401k + ~121k (fix round) | ~178k + ~104k, re-reviews ~195k + ~112k (two lanes) | 1 |
Owner minutes this week: 0 so far (the owner queue holds 10 items). Last cold-start test: 2026-10-06, pass (independent reviewer).
