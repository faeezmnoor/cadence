// Stream E #7 (CAD-Stream-E): Apply migration 0018 (language_interest_events).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0018.mjs

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
  path.join(import.meta.dirname, "migrations/0018_language_interest_events.sql"),
  "utf8"
);

try {
  console.log("[apply-0018] applying 0018_language_interest_events.sql ...");
  await sql.unsafe(ddl);
  const tbl = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name='language_interest_events'
  `;
  if (tbl.length === 0) {
    console.error("[apply-0018] FAIL: table missing");
    process.exit(1);
  }
  console.log("[apply-0018] done.");
} finally {
  await sql.end({ timeout: 5 });
}
