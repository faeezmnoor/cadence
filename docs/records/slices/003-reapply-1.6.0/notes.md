<!-- layer: knowledge · status: living (while open) · verified: 2026-11-11 · budget: 200 lines -->
# 003 · notes — audit report (bundle 1.6.0)
Lint before: 3 FAIL (S9, S5, T3), 2 WARN (T7, S1). After: 0 FAIL, 1 WARN (S1, LICENSE missing: Cadence is deliberately unlicensed, all rights reserved).

## A — instructions
- A01 · AGENTS.md:2 · declared standard 1.3.0, verified 2026-10-06. Decision: Rewrite to 1.6.0 and 2026-11-11. Evidence (observed): lint S5/S9. Goals: 1, 7 · weakens: none. APPLY-NOW.
- A02 · AGENTS.md, CLAUDE.md, docs/README.md · describe the plugin (shared roles, deliver, bookkeeping, cold-start): matches 1.6.0. Decision: Keep (A16). Goals: 2 · weakens: none. APPLY-NOW (no change).
- A03 · docs/README.md:3 · no harness-audit line (T7). Decision: Rewrite, add `audit: last 2026-11-11 · next 2027-05-11`. Goals: 7 · weakens: none. APPLY-NOW.
- A04 · AGENTS.md §7 and docs/README.md route open work to docs/slices/ (correct; closed work already points at docs/records/). Decision: Keep.

## S — skills and agents
- S01 · CLAUDE.md:7 · routed bugs to global `/investigate` (S06 ruling). Decision: Rewrite to the `deliver` skill with the `debugger` role, keeping the tier-A note for credits and billing. Goals: 2, 5 · weakens: none. APPLY-NOW.
- S02 · CLAUDE.md:9 · routed browser checks to global `/browse` or `/qa`. Decision: Rewrite to `deliver` with the `qa` role. APPLY-NOW.
- S03 · .claude/agents/cadence-eval-quality.md (30 lines), cadence-security.md (35), skills/cadence-eval (31) · all under 80 lines, paths named exist (apps/web/server/eval, evals, auth, billing, webhook route observed in the repo tree by the prior slice). Decision: Keep (S16 does not apply).
- S04 · .claude/settings.json · permissions only, no hooks. Keep.

## M — state and records
- M01 · STATE.md · verified 2026-10-06 (T3 FAIL); "Built, not merged: slice 001" stale (merged as #52/#53/#54); "main has no branch protection" stale (API: required checks `check`, `standard-check`). Decision: Rewrite from commands. APPLY-NOW.
- M02 · STATE.md Blocked · backup failing since 2026-10-02, latest run 2026-11-11, `DATABASE_URL` unset. Recorded as fact; not fixed.
- M03 · docs/OWNER-QUEUE.md · all ten rows reviewed; none edited (owner's). NEEDS-THE-OWNER: see the report. OQ-02 evidence refreshed (still failing, no repository secrets).
- M04 · docs/roadmap.md · export-dated 2026-10-06; Linear CAD-222, 216, 210, 215 still In Progress (read 2026-11-11), so "Now" is unchanged. Keep.
- LICENSE (S1 WARN) · REJECTED as a fix: adding a licence would loosen the owner's deliberate all-rights-reserved ruling; goal 4 (owner decisions stay the owner's). Reported.

## Not done
No Sentry, Inngest or Telegram checks (need the owner's dashboards and secrets).
