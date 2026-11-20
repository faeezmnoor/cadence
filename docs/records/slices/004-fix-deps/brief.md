<!-- layer: knowledge · status: living (while open) · verified: 2026-11-11 · budget: 200 lines -->
# 004 · fix-deps — brief (context pack)
Status: BUILD. Tier: A (production dependencies of the live app; merging to main deploys). Branch slice/004-fix-deps off main.

## Why
`pnpm audit --prod --audit-level=high` fails on main as of 2026-11-11 (found by the re-apply slice 003; CI had not run since 2026-10-06): 2 critical (Next.js unauthenticated remote code execution, vulnerable <= 15.5.27; Sentry JavaScript middleware bypass with tunnel, vulnerable >= 10.0.0-alpha.0 < 10.75.2) and 2 high (Next.js App Router denial of service <= 15.5.27; Zod memory exhaustion < 4.6.6), 24 advisories in all. The app is public and live.

## Scope
Clear every high and critical advisory with the smallest version change that does it: patch or minor bumps within the current major (next 15.5.x → the first patched 15.5.y; @sentry/* within 10.x; zod within its major, or a pnpm override for a transitive copy, as slice 002 did in pnpm-workspace.yaml). No major upgrades, no code changes beyond what a bump strictly requires, no unrelated bumps. Read docs/records/slices/002-fix-ci/ for how October's patch was done and reviewed.

## Gates (write gates.md first)
`pnpm audit --prod --audit-level=high` exit 0; `pnpm typecheck && pnpm lint && pnpm test` exit 0; `pnpm build` exit 0 for the web app; the lockfile diff touches only the bumped packages and their dependents (list them in notes.md); `bun .standard/standard-check.mjs .` 0 FAIL.

## Do not
Push, open a pull request, deploy, touch secrets or branch protection. Stop and report if a fix needs a major bump or a code change beyond a type fix.

## Report (≤ 250 words)
Each advisory id → package, from → to, direct or override; audit result; verification results; lockfile summary; anything not fixed and why.
