<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 · budget: 200 lines -->
# 002 · fix-ci — brief (context pack)
Source: the house-standard migration plan for this repo (slice 001, OQ-1): CI on main has been red since 2026-08-18.

Goal: make `pnpm typecheck && pnpm lint && pnpm test` exit 0 on main again with the smallest correct change, so the migration can merge under the green-on-exact-head rule.
In scope: apps/web/test/searcher-registry.test.ts opens a migration file by name (`0028_digest_specs_searcher.sql`) that now exists as `0031_digest_specs_searcher.sql` (verified by the planner with a local run: 1 failed of 12). Fix the test so it finds the migration by its stable suffix (glob `*_digest_specs_searcher.sql` in the migrations folder) rather than a hard-coded sequence number, and add the one-line comment why. If other tests fail on main for other reasons, stop and report them; do not fix them here.
Out of scope: everything else; no migration content changes; no snapshot updates beyond what this test needs.
Stop if: the failure is not the file name (report what it is).

## Rules that apply
- Minimal diff; failing test first is already the case (it fails on main); one commit; never `git add -A`; commit message ends with: Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
- No names, no absolute paths in committed files (public repository).

## Files to read (only these)
- apps/web/test/searcher-registry.test.ts; the migrations folder listing (`ls apps/web/drizzle` or wherever drizzle.config.ts points); package.json scripts

## Report
Fixed format, under 150 words: Verdict · Commit · `pnpm test` result (counts) · Needs the owner.
