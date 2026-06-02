// One-shot apply of migration 0004 (T-301 + T-302).
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0004.mjs
// Safe to re-run: ADD COLUMN IF NOT EXISTS, DROP INDEX IF EXISTS, and
// CREATE INDEX IF NOT EXISTS make every statement idempotent.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0004.mjs");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(import.meta.dirname, "migrations/0004_runs_idempotency_and_minute_index.sql");
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0004] running 0004_runs_idempotency_and_minute_index.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0004] ok");
} catch (err) {
  console.error("[apply-0004] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
