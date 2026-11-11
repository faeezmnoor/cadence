# STATE — Cadence
<!-- layer: state · status: living · budget: 80 lines -->
verified: 2026-11-11 at 5a6f68f by commands on branch slice/004-fix-deps (pnpm audit, typecheck, lint, test, build; gh api deployments, branch protection and run list)

## Now
- Production (Vercel): deployment of main 5a6f68f, created 2026-10-06. Chat configuration, Telegram linking and delivery, feedback and weekly distillation, the credit ledger with admin grants and refunds.
- main 5a6f68f: `pnpm audit --prod --audit-level=high` fails (2026-11-11): Next.js remote code execution (critical), Next.js denial of service (high), Sentry tunnel middleware bypass (critical), Zod memory exhaustion (high).
- Slice 004-fix-deps (branch slice/004-fix-deps, not pushed): next 15.5.28 and @sentry/nextjs 10.75.2 clear the first three; the Zod advisory has no patched 3.x and carries a temporary audit exception (decision 0013, proposed, review 2026-12-11). With it the audit at high exits 0; typecheck, lint, test and build exit 0.
- Not live: card checkout (no Stripe integration in code); Advanced research paused behind `PRO_TIER_ALPHA` (decision 0009); Custom mode deferred (decision 0010).
- main is protected (verified 2026-11-11).

## Next
1. 004-fix-deps — review lanes, PR, merge, production deploy (waits on: reviewers, orchestrator)
2. Re-apply house standard 1.6.1, PR #55 — its `check` job fails on the same audit; rebase after 004 merges (waits on: 004-fix-deps)
3. Choose how to close the Zod advisory before 2026-12-11 (waits on: owner, OQ-11)
4. Triage CAD-222, CAD-215, CAD-216, CAD-210 (waits on: owner, OQ-05)
5. CAD-70 to CAD-72 — config-agent tasks, Urgent (waits on: triage)

## Blocked
- Production runs Next.js 15.5.27 with a critical remote-code-execution advisory until 004-fix-deps merges and deploys.
- Nightly database backup: failed on 2026-11-08, 2026-11-10 and 2026-11-11 runs (gh run list); Actions secret `DATABASE_URL` unset (OQ-02).
- Telegram webhook secret: exposed in git history until rotated (OQ-01).
- Checkout: Stripe Malaysian KYC (OQ-07). Advanced: lead +0.26 against the 0.5 gate, needs owner ratings (OQ-06).
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
Owner minutes this week: 0 so far (the owner queue holds 11 items). Last cold-start test: 2026-10-06, pass (independent reviewer).
