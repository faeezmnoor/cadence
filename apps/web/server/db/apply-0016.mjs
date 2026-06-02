// PM-audit #11: apply migration 0016 (account_deletions).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0016.mjs

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
  path.join(import.meta.dirname, "migrations/0016_account_deletions.sql"),
  "utf8"
);

try {
  console.log("[apply-0016] applying 0016_account_deletions.sql ...");
  await sql.unsafe(ddl);
  const tbl = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name='account_deletions'
  `;
  if (tbl.length === 0) {
    console.error("[apply-0016] FAIL: table missing");
    process.exit(1);
  }
  console.log("[apply-0016] done.");
} finally {
  await sql.end({ timeout: 5 });
}
