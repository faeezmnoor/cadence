// One-shot apply of migration 0009 (T-407 / CAD-48:
// feedback_eval_runs — feedback loop eval harness storage).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0009.mjs
//
// Safe to re-run: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
// + ENABLE ROW LEVEL SECURITY are all idempotent on Postgres.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0009.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0009_feedback_eval_runs.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0009] running 0009_feedback_eval_runs.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0009] ok");

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'feedback_eval_runs'
    ORDER BY ordinal_position
  `;
  console.log("[apply-0009] verify feedback_eval_runs columns:", cols);
} catch (err) {
  console.error("[apply-0009] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
