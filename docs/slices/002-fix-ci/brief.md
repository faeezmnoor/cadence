<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 · budget: 200 lines -->
# 002 · fix-ci — brief (context pack)
Source: the house-standard migration plan for this repo (slice 001, OQ-1): CI on main has been red since 2026-08-18.

Goal: make `pnpm typecheck && pnpm lint && pnpm test` exit 0 on main again with the smallest correct change, so the migration can merge under the green-on-exact-head rule.
In scope: apps/web/test/searcher-registry.test.ts opens a migration file by name (`0028_digest_specs_searcher.sql`) that now exists as `0031_digest_specs_searcher.sql` (verified by the planner with a local run: 1 failed of 12). Fix the test so it finds the migration by its stable suffix (glob `*_digest_specs_searcher.sql` in the migrations folder) rather than a hard-coded sequence number, and add the one-line comment why. If other tests fail on main for other reasons, stop and report them; do not fix them here.
Out of scope: everything else; no migration content changes; no snapshot updates beyond what this test needs.
Stop if: the failure is not the file name (report what it is).

## Rules that apply
- Minimal diff; failing test first is already the case (it fails on main); one commit; never `git add -A`; commit message ends with the Co-Authored-By trailer for Claude Fable 5.1 (Anthropic's no-reply address; written out in the orchestrator's prompt)
- No names, no absolute paths in committed files (public repository).

## Files to read (only these)
- apps/web/test/searcher-registry.test.ts; the migrations folder listing (`ls apps/web/drizzle` or wherever drizzle.config.ts points); package.json scripts

## Report
Fixed format, under 150 words: Verdict · Commit · `pnpm test` result (counts) · Needs the owner.

## Extension (orchestrator, 6 October 2026): the audit step
CI's `check` job also runs `pnpm audit --prod --audit-level=high` and fails on a high-severity advisory in the transitive dependency `fast-uri` ("host confusion via failed IDN"). This fails on main too, so it is in scope for "make CI green". Do: find which direct dependency pulls `fast-uri` (`pnpm why fast-uri`), and resolve by the smallest safe change: prefer updating that direct dependency to a version that pulls a patched `fast-uri`; if none exists, add a `pnpm.overrides` entry in the root package.json pinning `fast-uri` to the patched version named by the advisory, with a one-line comment in the PR description. Run `pnpm install` (lockfile updates are expected and committed), then `pnpm audit --prod --audit-level=high` must exit 0 and `pnpm typecheck && pnpm lint && pnpm test` must still exit 0. One commit for the dependency change. Stop and report if the patched version breaks a test or if the advisory has no fix.

## Ruling on scope (orchestrator, 6 October 2026): option (a), on this branch, as its own commit
The audit fails on 2 critical and 27 high advisories across 11 packages, the first a critical unauthenticated RCE in Next.js (GHSA-p293-qw3h-jr36; repo pins 15.5.18; patched in 15.5.24+). A patch-level framework update is a security fix, not a framework change, and the live product is exposed until it ships. Do, in this order, one commit per step:
1. Bump `next` (and `eslint-config-next` / `@next/*` packages that must match) to the latest 15.5.x release. `pnpm install`. Run `pnpm typecheck && pnpm lint && pnpm test`; stop and report if anything fails.
2. For each remaining high or critical advisory whose package cannot be fixed by updating a direct dependency, add a `pnpm.overrides` pin to the first patched version named by the advisory (fast-uri ^3.1.8, and the others: sharp, postcss, source-map-js, brace-expansion, browserslist, nanoid, jsondiffpatch, @grpc/grpc-js, @opentelemetry/propagator-jaeger). Prefer direct-dependency updates where they exist and are patch-level. `pnpm install`; re-run the three commands after each group.
3. `pnpm audit --prod --audit-level=high` must exit 0. If an advisory has no patched version, record it in notes.md and stop; do not lower the audit level or ignore advisories.
4. `pnpm build` locally if environment permits; otherwise the PR's Vercel preview is the build evidence.
Record every advisory id, the package, the change and the verification in docs/slices/002-fix-ci/notes.md. Nothing else changes.
