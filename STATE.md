# STATE — Cadence
<!-- layer: state · status: living · budget: 80 lines -->
verified: 2026-11-20 at d0e4abd by the orchestrator: PR #60 merged (checks pass on its head), gh deployments (latest Production 845011a, 2026-11-17, success; none recorded for d0e4abd, a documents-only commit), curl of / and /pricing (200), the 1.7.0 documentation lint (0 FAIL)

## Now
- Production (Vercel): latest recorded deployment is main 845011a (2026-11-17, success; / and /pricing answer 200 on 2026-11-20); the product code is that of 39a29c1. Chat configuration, Telegram linking and delivery, feedback and weekly distillation, the credit ledger with admin grants and refunds.
- Request guards live (slice 005-zod-guard, PR #58, GHSA-mrhx-c7xc-m3w5; decision 0013 option B): body limits before any parser (chat 1 MiB, tRPC 384 KiB; a larger body gets 413); a hand-written chat message shape check (200 messages, 500 list elements); a tRPC input guard before superjson and Zod; bounded tRPC error responses; `weekdays` and `skipDates` bounded. 1,373 tests; security review round 3 APPROVE. Not verified on Vercel under attack shapes (measured locally, Node 26) and not in a browser.
- main 39a29c1: `pnpm audit --prod --audit-level=high` keeps one ignored advisory (Zod GHSA-mrhx-c7xc-m3w5) until option A lands; decision 0013 accepted, owner item OQ-11 closed 2026-11-13.
- House standard 1.7.0 re-applied 2026-11-20 (PR #60, d0e4abd): lint bundle and declared version; no line-length or chain-length rows, so nothing changes on 2026-12-14.
- Slices merged to main (git log): 004-fix-deps #56, 003 re-apply of house standard 1.6.1 #57, 005-zod-guard #58, the 1.7.0 re-apply #60; their folders are in docs/records/slices/. Not live: card checkout (no Stripe integration in code); Advanced research paused behind `PRO_TIER_ALPHA` (decision 0009); Custom mode deferred (decision 0010).
- main is protected (verified 2026-11-11).

## Next
1. Zod 4 with AI SDK 5 — decision 0013 option A; removes the audit exception and supersedes that decision; needs the G-eval move-or-hold number (decision 0012). No owner wait.
2. Roadmap follow-ups from slice 005: burst limit on tRPC mutations; bound `chat.appendMessage` content; path-length cap in the tRPC input guard; two input-guard tests (no owner wait; roadmap Next)
3. Triage CAD-222, CAD-215, CAD-216, CAD-210 (waits on: owner, OQ-05)
4. CAD-70 to CAD-72 — config-agent tasks, Urgent (waits on: triage)

## Blocked
- Nightly database backup: failed on 2026-11-08, 2026-11-10 and 2026-11-11 runs (gh run list); Actions secret `DATABASE_URL` unset (OQ-02).
- Telegram webhook secret: exposed in git history until rotated (OQ-01).
- Checkout: Stripe Malaysian KYC (OQ-07). Advanced: lead +0.26 against the 0.5 gate, needs owner ratings (OQ-06).
- Reported: code and tests carry the owner's contact values; documents are redacted, code is not (OQ-10).

## Direction in force
- Prove the brief before charging: dogfood bar and the Advanced eval gate come before checkout and public signup (decisions 0009, 0012).
- Lead with the value, never the channel; credits only; "brief" is the noun (decisions 0001, 0002, 0003, 0005, 0010).

## Owner items
see docs/OWNER-QUEUE.md (ten open items, OQ-01 to OQ-10)

## Measurements
| Slice | Planner tokens | Builder tokens | Reviewer tokens | Fix rounds |
| --- | --- | --- | --- | --- |
| 005-zod-guard | not recorded | not recorded | not recorded | not recorded |
| 002-fix-ci | — | ~55k + ~63k + ~78k (test fix, audit scope, security patches) | ~83k + challenger ~74k | 0 |
| 001-adopt-standard | ~257k | ~401k + ~121k (fix round) | ~178k + ~104k, re-reviews ~195k + ~112k (two lanes) | 1 |
Owner minutes this week: 0 so far (the owner queue holds 10 items). Last cold-start test: 2026-10-06, pass (independent reviewer).
