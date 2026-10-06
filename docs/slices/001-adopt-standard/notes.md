<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 -->
# 001 · adopt-standard — notes

## T001 Freeze
- `gh pr list --state open`: empty (verified 2026-10-06).
- origin/main head after `git fetch origin`: 001508c "Fix CI: locate the searcher migration by suffix, not sequence number (#51)", 2026-10-06. The plan named 352b2e4; slice 002-fix-ci (test path fix plus the dependency security patches) merged on top of it the same day (verified: `git log origin/main`). This branch is rebased onto 001508c.

## T002 Preconditions
- Standard VERSION: 1.2.2 (verified: `$STANDARD_DIR/VERSION`). The vendored bundle `.standard/standard-check.mjs` is byte-identical to `$STANDARD_DIR/dist/standard-check.mjs` and carries `standard-check-version: 1.2.2` (verified: `cmp`, `head -3`). The declaration uses 1.2.2, not the 1.1.2 that spec.md A6 recorded.
- `$STANDARD_DIR/scripts/gen-schema.ts` exists on the standard repo's main (verified: merged in d12412f, "005 generators").
- Linear source: the orchestrator's export (brief.md "Linear CAD export" and linear-export.md); the builder read no Linear tools (ruling OQ-4).
- Orchestrator rulings copied from brief.md "Orchestrator rulings":
  - OQ-1 (a): slice 002-fix-ci lands first and makes main green; G2 unchanged. Status: merged as 001508c; CI on main green (run 37481884290, verified).
  - OQ-2: `decision-makers: the owner (ruled by owner)` and `the orchestrator`; roles, never names.
  - OQ-3 (a): redact archived copies (home paths → `<repo>/` or `<old-workspace>/`; the owner's name → "the owner"; e-mail, secret values, bot handles → `[redacted]`); index reason says "redacted for publication"; owner rotates the webhook secret; history never rewritten.
  - OQ-4: the export is the Linear source.
  - OQ-5: docs/OWNER-QUEUE.md with generic wording, Linear ids allowed, no URLs, no names.
  - OQ-6 (b): if `pnpm build` fails only for missing environment values, the Vercel preview of the PR head is G3's evidence.
  - OQ-7: archive `.claude` content under `docs/_archive/2026-10/_claude/…`.
  - OQ-8: public; §12 Hygiene applies in full.

## T003 Inventory (tracked files not in plan.md's disposition table)
| Path | Disposition | Reason |
| --- | --- | --- |
| docs/slices/002-fix-ci/ (brief, gates, notes) | K, untouched | Merged slice; its move to docs/records/slices/ is that slice's CLOSE (bookkeeper), not this slice |
| docs/records/reviews/002-fix-ci.md | K, untouched; indexed in docs/records/index.md | Review record of slice 002 |
| docs/slices/001-adopt-standard/linear-export.md | K; header layer changed records → knowledge | Lint S4: slice files are knowledge while open |
| .standard/standard-check.mjs, .standard/VERSION | K | Vendored lint 1.2.2 (commit f474ecc) |
| .github/workflows/db-backup.yml | K, untouched | Out of scope by dispatch |
| scripts/linear-status.sh, vercel.json, .env.example, .npmrc, pnpm-workspace.yaml | K | Code and config; listed in AGENTS.md §8 where useful |
| LICENSE (absent) | none | Lint S1 WARN only. The repository is deliberately all-rights-reserved (inferred from the owner's portfolio notes); a LICENSE file stating that is an owner decision, reported, not added |
