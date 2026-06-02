// One-shot apply of migration 0008 (T-404 / CAD-45:
// learning_log.consumed_at — composer feedback injection bookkeeping).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0008.mjs
//
// Safe to re-run: ADD COLUMN IF NOT EXISTS.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0008.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0008_learning_log_consumed_at.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0008] running 0008_learning_log_consumed_at.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0008] ok");

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'learning_log'
      AND column_name = 'consumed_at'
  `;
  console.log("[apply-0008] verify learning_log.consumed_at:", cols);
} catch (err) {
  console.error("[apply-0008] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
