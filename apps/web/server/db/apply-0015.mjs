// T-413 / CAD-73: Apply migration 0015 (chat_messages.archived_at) directly.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0015.mjs
//
// drizzle-kit migrate remains broken in this project; we apply via the
// postgres client directly. The DDL uses IF NOT EXISTS so this is safely
// idempotent — re-run is a no-op.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0015.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0015_chat_messages_archived_at.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0015] applying 0015_chat_messages_archived_at.sql ...");
  await sql.unsafe(ddl);

  const col = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'archived_at'
  `;
  if (col.length === 0) {
    throw new Error("archived_at column missing after migration");
  }
  console.log(
    `[apply-0015] ok: ${col[0].column_name} ${col[0].data_type} null=${col[0].is_nullable}`
  );
} catch (err) {
  console.error("[apply-0015] FAILED:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
