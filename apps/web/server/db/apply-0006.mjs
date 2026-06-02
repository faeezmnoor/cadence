// One-shot apply of migration 0006 (T-401 + T-402 / CAD-42, CAD-43).
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0006.mjs
// Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0006.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0006_feedback_inline_keyboard.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0006] running 0006_feedback_inline_keyboard.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0006] ok");

  const specCols = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'digest_specs' AND column_name = 'keyboard_enabled'
  `;
  console.log("[apply-0006] verify digest_specs.keyboard_enabled:", specCols);

  const fbCols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'feedback_events'
      AND column_name IN ('vote', 'telegram_callback_id', 'source', 'signal_type')
    ORDER BY column_name
  `;
  console.log("[apply-0006] verify feedback_events columns:", fbCols);

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'feedback_events'
      AND indexname = 'feedback_events_telegram_callback_id_uq'
  `;
  console.log("[apply-0006] verify dedupe index:", idx);
} catch (err) {
  console.error("[apply-0006] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
