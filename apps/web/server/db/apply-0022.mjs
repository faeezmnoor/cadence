// Security HIGH #2 — apply migration 0022 (rate_limits).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0022.mjs

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
  path.join(import.meta.dirname, "migrations/0022_rate_limits.sql"),
  "utf8"
);

try {
  console.log("[apply-0022] applying 0022_rate_limits.sql ...");
  await sql.unsafe(ddl);

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rate_limits'
    ORDER BY ordinal_position
  `;
  if (cols.length === 0) {
    console.error("[apply-0022] FAIL: rate_limits table not present");
    process.exit(1);
  }
  console.log("[apply-0022] OK columns:", cols.map((c) => c.column_name).join(", "));
} finally {
  await sql.end();
}
