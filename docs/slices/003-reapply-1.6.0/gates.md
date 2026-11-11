<!-- layer: knowledge · status: living (while open) · verified: 2026-11-11 · budget: 100 lines -->
# 003 · gates
| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| Lint | `bun .standard/standard-check.mjs .` | 0 FAIL | 0 FAIL, 1 WARN (S1 LICENSE, deliberate) at bundle 1.6.0, 2026-11-11 |
| Verification | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | exit 0 (typecheck, lint, 130 test files / 1224 tests passed, 25 skipped), 2026-11-11 |
| Audit line | `grep -n '^audit: last' docs/README.md` | one line | docs/README.md:5: audit: last 2026-11-11 · next 2027-05-11 |
| No product change | `git diff --quiet origin/main -- apps packages` | exit 0 | exit 0, 2026-11-11 |
