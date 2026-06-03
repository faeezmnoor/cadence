// QA P2 #2: Apply migration 0021 (language_interest_events.email).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0021.mjs

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
  path.join(import.meta.dirname, "migrations/0021_language_interest_email.sql"),
  "utf8"
);

try {
  console.log("[apply-0021] applying 0021_language_interest_email.sql ...");
  await sql.unsafe(ddl);

  const col = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'language_interest_events'
      AND column_name = 'email'
  `;
  if (col.length === 0) {
    console.error("[apply-0021] FAIL: email column not present");
    process.exit(1);
  }
  console.log("[apply-0021] OK:", col[0]);
} finally {
  await sql.end();
}
