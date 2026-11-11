# STATE — Cadence
<!-- layer: state · status: living · budget: 80 lines -->
verified: 2026-11-11 at 5a6f68f by commands: git log, gh run list for both workflows, gh pr list, gh api branch protection, gh secret list, Linear reads

## Now
- House standard 1.6.0 re-applied (slice 003-reapply-1.6.0, branch slice/003-reapply-1.6.0, not yet merged): lint bundle 1.6.0 vendored, declared version and audit line (last 2026-11-11, next 2027-05-11) in place, CLAUDE.md routes bugs and browser checks through the plugin roles.
- Production (Vercel, from main 5a6f68f, deployed 2026-10-06): chat configuration, Telegram linking and delivery, feedback and weekly distillation, the credit ledger with admin grants and refunds. No product commit since 2026-10-06; no automated commits to main.
- Not live: card checkout (no Stripe integration in code); Advanced research paused behind `PRO_TIER_ALPHA` (decision 0009); Custom mode deferred (decision 0010).
- CI (workflow `CI`): last run 2026-10-06, success. `DB backup`: failing on every scheduled run, latest 2026-11-11 00:24 UTC; the job stops at its own check, "DATABASE_URL secret is not set", and `gh secret list` shows no repository secrets (OQ-02). Not fixed here.
- Open pull requests: none. main branch protection: required status checks `check` and `standard-check`, strict, no required review, admins not enforced (read from the API 2026-11-11; the 2026-10-06 line "no protection" is superseded).
- Linear CAD (read 2026-11-11): CAD-222, CAD-216, CAD-210, CAD-215 still In Progress, last updated June 2026.

## Next
1. Merge slice 003-reapply-1.6.0 (waits on: reviewers, orchestrator)
2. Triage CAD-222, CAD-215, CAD-216, CAD-210 (waits on: owner, OQ-05)
3. CAD-70 to CAD-72 — config-agent tasks, Urgent (waits on: triage)
4. CAD-228 — Standard web-search default chosen by eval (waits on: nothing)

## Blocked
- Nightly database backup: fails every run since at least 2026-10-02 (latest 2026-11-11); Actions secret `DATABASE_URL` unset (OQ-02).
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
Owner minutes this week: 0 so far (the owner queue holds 10 items). Last cold-start test: 2026-10-06, pass (independent reviewer).
