<!-- layer: knowledge · status: living (while open) · verified: 2026-11-11 · budget: 200 lines -->
# 003 · reapply-1.6.0 — brief
Status: BUILD. Tier: B. Role: builder.

## What and why
Cadence re-applies house standard 1.6.0 as part of the standard repository's slice 018 (fleet re-apply): vendor the 1.6.0 lint bundle, clear the lint FAILs, run the three harness audits locally, refresh STATE.md from commands. No product code, dependency or workflow changes (the lint job already has `fetch-depth: 0`).

## Rulings in force
S06 (bugs and browser checks route through the deliver skill with the debugger and qa roles), A16 (entry files describe the plugin as it is in 1.6.0), S16 (specialists over 80 lines are trimmed; none qualifies), the db-backup failure is reported as a fact in STATE.md and not fixed.

## Out of scope
Anything under apps/ or packages/, branch protection, secrets, the owner queue rows.
