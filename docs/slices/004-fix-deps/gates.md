<!-- layer: records · status: living (while open) -->
# 004 · fix-deps — gate ledger
Written before code. Only a script marks EVIDENCE by re-running CHECK. Prefer "zero failed" to "exactly N passed". The last two gates are always: full verification exits 0 at the final commit; each review file holds its verdict line.

| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| G1 | `pnpm audit --prod --audit-level=high` | exit 0 | cb9c2a1 2026-11-11T08:19:41.979Z exit=0 |
| G2 | `pnpm install --frozen-lockfile` | exit 0 | cb9c2a1 2026-11-11T08:19:42.688Z exit=0 |
| G3 | `DATABASE_URL=postgres://127.0.0.1:1/build INNGEST_SIGNING_KEY=signkey-prod-0000000000000000 INNGEST_EVENT_KEY=placeholder pnpm build` | exit 0 | cb9c2a1 2026-11-11T08:20:17.828Z exit=0 |
| G4 | `bash docs/slices/004-fix-deps/lockfile-scope.sh` | exit 0 | cb9c2a1 2026-11-11T08:20:17.868Z exit=0 |
| G5 | `bun .standard/standard-check.mjs .` | exit 0 | |
| G6 | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | cb9c2a1 2026-11-11T08:20:35.137Z exit=0 |
| G7 | `grep -q '^VERDICT:' docs/slices/004-fix-deps/review.md` | exit 0 | cb9c2a1 2026-11-11T08:20:35.147Z exit=0 |
