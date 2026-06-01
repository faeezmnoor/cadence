// One-shot apply of migration 0003 + reset of poisoned brave_search cache rows.
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0003.mjs
// Safe to re-run: ENABLE RLS / REVOKE are idempotent; the cache reset uses an
// expires_at past-stamp which is also idempotent.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0003.mjs");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

const migrationPath = path.join(import.meta.dirname, "migrations/0003_lock_shared_tables.sql");
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0003] running migration 0003_lock_shared_tables.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0003] migration ok");

  console.log("[apply-0003] resetting poisoned brave_search source_cache rows (expires_at -> past) ...");
  const reset = await sql`
    UPDATE source_cache
       SET expires_at = NOW() - INTERVAL '1 day',
           updated_at = NOW()
     WHERE connector = 'brave_search'
       AND created_at >= NOW() - INTERVAL '24 hours'
    RETURNING id, key, created_at
  `;
  console.log(`[apply-0003] expired ${reset.length} brave_search rows:`);
  for (const r of reset) console.log(`  - ${r.id} key=${r.key} created_at=${r.created_at.toISOString()}`);

  console.log("[apply-0003] verifying RLS is enabled ...");
  const verify = await sql`
    SELECT relname, relrowsecurity
      FROM pg_class
     WHERE relname IN ('source_cache', 'rss_items')
       AND relnamespace = 'public'::regnamespace
  `;
  for (const v of verify) console.log(`  - ${v.relname} rls=${v.relrowsecurity}`);
} finally {
  await sql.end();
}
