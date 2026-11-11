<!-- layer: knowledge · status: living (while open) · verified: 2026-11-11 · budget: 100 lines -->
# 003 · gates
| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| Lint | `bun .standard/standard-check.mjs .` | 0 FAIL | (filled below) |
| Verification | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | (filled below) |
| Audit line | `grep -n '^audit: last' docs/README.md` | one line | (filled below) |
| No product change | `git diff --quiet origin/main -- apps packages` | exit 0 | (filled below) |
