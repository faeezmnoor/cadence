// Review CTO P2-2 — apply migration 0028 (partial unique index on
// transactions ((metadata->>'grantId')) WHERE type='admin_grant', so
// concurrent admin grants with the same grantId cannot double-credit).
//
// Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS; re-running converges.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0028.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0028] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0028] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0028_grant_idempotency.sql"),
  "utf8"
);

try {
  console.log("[apply-0028] applying 0028_grant_idempotency.sql ...");
  await sql.unsafe(ddl);

  // Verify: the index exists, is UNIQUE, and is partial on admin_grant.
  const rows = await sql`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'transactions_admin_grant_grant_id_uq'
  `;
  if (rows.length === 0) {
    await fail("transactions_admin_grant_grant_id_uq missing after migration");
  }
  const def = rows[0].indexdef;
  if (!/CREATE UNIQUE INDEX/i.test(def)) await fail(`index is not UNIQUE: ${def}`);
  if (!def.includes("admin_grant")) await fail(`index is not partial on admin_grant: ${def}`);
  if (!def.includes("grantId")) await fail(`index does not key on grantId: ${def}`);
  console.log(`[apply-0028] OK: ${def}`);
} catch (err) {
  console.error("[apply-0028] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0028] done.");
