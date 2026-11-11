<!-- layer: records · status: living (while open) -->
# 004 · fix-deps — gate ledger
Written before code. Only a script marks EVIDENCE by re-running CHECK. Prefer "zero failed" to "exactly N passed". The last two gates are always: full verification exits 0 at the final commit; each review file holds its verdict line.

| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| G1 | `pnpm audit --prod --audit-level=high` | exit 0 | e202c34 2026-11-11T08:08:49.978Z exit=0 |
| G2 | `pnpm install --frozen-lockfile` | exit 0 | e202c34 2026-11-11T08:08:50.431Z exit=0 |
| G3 | `DATABASE_URL=postgres://127.0.0.1:1/build INNGEST_SIGNING_KEY=signkey-prod-0000000000000000 INNGEST_EVENT_KEY=placeholder pnpm build` | exit 0 | e202c34 2026-11-11T08:09:04.285Z exit=0 |
| G4 | `bash docs/slices/004-fix-deps/lockfile-scope.sh` | exit 0 | e202c34 2026-11-11T08:09:04.310Z exit=0 |
| G5 | `bun .standard/standard-check.mjs .` | exit 0 | e202c34 2026-11-11T08:09:04.437Z exit=0 |
| G6 | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | e202c34 2026-11-11T08:09:11.840Z exit=0 |
| G7 | `grep -q '^VERDICT:' docs/slices/004-fix-deps/review.md` | exit 0 | |
