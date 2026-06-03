// Evals Phase 0: Apply migration 0020 (digest_runs.metadata jsonb).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0020.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0020_digest_runs_metadata.sql"),
  "utf8"
);

try {
  console.log("[apply-0020] applying 0020_digest_runs_metadata.sql ...");
  await sql.unsafe(ddl);

  const col = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'digest_runs'
      AND column_name = 'metadata'
  `;
  if (col.length === 0) {
    console.error("[apply-0020] FAIL: metadata column not present");
    process.exit(1);
  }
  console.log("[apply-0020] OK:", col[0]);
} finally {
  await sql.end();
}
