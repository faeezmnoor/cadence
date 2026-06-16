---
name: cadence-fix-pass
description: Cadence surgical fix pass — 2 to 8 small, well-scoped, independently revertable fixes shipped in one session, one commit per fix. Use for a UX P0 batch, post-release polish, or accessibility cleanup. NOT for refactors, schema changes, or anything that could cascade. Claude-Code-native port.
---

# Cadence Fix Pass — N small surgical fixes in sequence

## When to use
2–8 small, well-scoped bug fixes or UX polish items, each touching a few files with a clear acceptance criterion and independently revertable. NOT for refactors, schema changes, or cascading work (use `cadence-build-wave`).

## Recipe (Claude Code on this Mac)
1. Repo root `/Users/faeez/dev/projects/cadence` (app in `apps/web`); run pnpm/git from root. `git status` clean; `git pull --ff-only`; confirm green: `pnpm typecheck` (or `npx vitest run --changed` if fast).
2. For EACH fix in order:
   - Read the affected file(s) on the exact range before editing.
   - Make the minimal change — no drive-by formatting, no "while I'm here" cleanups.
   - Scoped check: `pnpm typecheck` + targeted `npx vitest run <file>` if a test covers the surface.
   - `git add <specific files>` (never `git add -A`).
   - Commit `fix(<area>): <imperative summary>` — one logical change per commit.
   - `git push` immediately.
3. After all fixes: full `pnpm typecheck && pnpm lint && pnpm test` once. Watch the Vercel preview to green.
4. Report each commit SHA + one-line outcome. If a fix reveals a deeper issue, file a new ticket — do NOT expand scope inline.

## Pitfalls
- Bundling fixes into one commit — reverts become impossible. ONE fix = ONE commit.
- Skipping `pnpm typecheck` between fixes — a type error in fix 2 tanks fixes 3–8.
- Editing `docs/*` numbered files (generated mirror).
- `--no-verify` to skip a pre-commit hook — fix the hook instead.
- Terminology drift: keep `digest_*` in code, "brief" in user-facing copy.
