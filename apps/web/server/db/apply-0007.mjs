// One-shot apply of migration 0007 (CAD-36 follow-up: DST fall-back fix).
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0007.mjs
// Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0007.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0007_dst_fallback_calendar_day.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0007] running 0007_dst_fallback_calendar_day.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0007] ok");

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'digest_runs'
      AND column_name = 'delivery_calendar_day_local'
  `;
  console.log("[apply-0007] verify digest_runs.delivery_calendar_day_local:", cols);

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'digest_runs'
      AND indexname = 'digest_runs_spec_local_day_uq'
  `;
  console.log("[apply-0007] verify partial unique index:", idx);
} catch (err) {
  console.error("[apply-0007] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
