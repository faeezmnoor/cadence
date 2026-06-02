// One-shot apply of migration 0005 (T-306 / CAD-41).
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0005.mjs
// Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0005.mjs");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(import.meta.dirname, "migrations/0005_smoke_spec_flag.sql");
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0005] running 0005_smoke_spec_flag.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0005] ok");
  // Verify the column is present.
  const rows = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'digest_specs' AND column_name = 'is_smoke'
  `;
  console.log("[apply-0005] verify is_smoke column:", rows);
} catch (err) {
  console.error("[apply-0005] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
