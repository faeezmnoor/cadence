// One-shot apply of migration 0011 (T-501a: monetization substrate).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0011.mjs
//
// Idempotent: every ADD COLUMN / CREATE TABLE / CREATE INDEX uses
// IF NOT EXISTS; policies are wrapped in DO blocks with existence
// checks. Safe to re-run.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0011.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0011_monetization.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0011] applying migration 0011_monetization.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0011] migration applied");

  // Sanity probes.
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
      AND column_name IN (
        'credits_balance','cost_to_us_micro_usd','country_code',
        'auto_topup_pack_id','auto_topup_threshold_credits','trial_credits_granted_at'
      )
    ORDER BY column_name
  `;
  console.log(`[apply-0011] users monetization columns present: ${cols.length}/6`);
  for (const c of cols) console.log(`  - ${c.column_name}`);

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('transactions','pricing_snapshots')
    ORDER BY table_name
  `;
  console.log(`[apply-0011] new tables present: ${tables.map((t) => t.table_name).join(", ")}`);

  const rls = await sql`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('transactions','pricing_snapshots')
  `;
  for (const r of rls) console.log(`  - ${r.tablename} RLS=${r.rowsecurity}`);
} catch (err) {
  console.error("[apply-0011] FAILED", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
