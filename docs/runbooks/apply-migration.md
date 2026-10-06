<!-- layer: knowledge · status: living · verified: 2026-10-06 -->
# Runbook — Apply a database migration

## When to use this
A slice changed apps/web/server/db/schema.ts or needs new SQL (constraints, row-level security, backfills) on the production database. When not to: never use `pnpm db:push` against production (lesson L-02), and never edit a migration or runner that has been applied (lesson L-01).

## Preconditions
| Needs | Check | Expected |
| --- | --- | --- |
| Production connection string in apps/web/.env.local | `cd apps/web && grep -c '^DATABASE_URL=' .env.local` | `1` |
| A fresh backup | GitHub Actions → "DB backup" → Run workflow (see docs/OWNER-QUEUE.md OQ-02) | green run today |
| Tests green on the branch | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 |
| The next free number | `ls apps/web/server/db/migrations apps/web/server/db/apply-*.mjs \| tail -4` | highest existing NNNN |

## Steps
1. Generate the SQL from the schema change (or write it by hand for policies and backfills):
   ```
   pnpm db:generate
   ```
   Expected: a new `apps/web/server/db/migrations/NNNN_<name>.sql`.
2. Write `apps/web/server/db/apply-NNNN.mjs` by copying the newest runner (`apply-0031.mjs` is the pattern): read the SQL, run it, then assert the post-state (column exists, constraint present, rows backfilled). It must be idempotent.
3. Apply it:
   ```
   cd apps/web && node --env-file=.env.local server/db/apply-NNNN.mjs
   ```
   Expected: `[apply-NNNN] OK: …` then `[apply-NNNN] done.`
4. Commit the SQL and the runner in the same pull request as the code that needs them.

## Verification
```
cd apps/web && node --env-file=.env.local server/db/apply-NNNN.mjs
```
Expected: a second run prints the same `OK` line (idempotent) and exits 0. Then regenerate the schema document: `bun run "$STANDARD_DIR/scripts/gen-schema.ts" .` from the repo root.

## Rollback
**Irreversible** once applied: write a new forward-fix migration and runner (`apply-NNNN+1.mjs`) that restores the wanted state; restore from the nightly dump only for data loss.

## Last run
2026-06-18 · apply-0031 (per-spec web-search provider, decision 0011) · outcome not recorded in the repository.
