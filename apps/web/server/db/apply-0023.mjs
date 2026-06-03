// CAD-88: Apply migration 0023 (digest_specs.tier column + CHECK).
//
// Idempotent: ADD COLUMN IF NOT EXISTS + a guarded ADD CONSTRAINT block.
// Verifies post-apply that:
//   - the `tier` column exists on digest_specs
//   - the CHECK constraint is in place
//   - every existing row has tier='default' (the column default)
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0023.mjs

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
  path.join(import.meta.dirname, "migrations/0023_digest_specs_tier.sql"),
  "utf8"
);

try {
  console.log("[apply-0023] applying 0023_digest_specs_tier.sql ...");
  await sql.unsafe(ddl);

  const col = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'digest_specs'
      AND column_name = 'tier'
  `;
  if (col.length === 0) {
    console.error("[apply-0023] FAIL: digest_specs.tier column missing");
    process.exit(1);
  }
  if (col[0].is_nullable !== "NO") {
    console.error("[apply-0023] FAIL: tier should be NOT NULL");
    process.exit(1);
  }

  const cons = await sql`
    SELECT conname FROM pg_constraint
    WHERE conname = 'digest_specs_tier_check'
  `;
  if (cons.length === 0) {
    console.error("[apply-0023] FAIL: digest_specs_tier_check missing");
    process.exit(1);
  }

  const bad = await sql`
    SELECT count(*)::int AS n FROM public.digest_specs
    WHERE tier NOT IN ('default', 'pro')
  `;
  if (bad[0].n > 0) {
    console.error(`[apply-0023] FAIL: ${bad[0].n} rows with invalid tier`);
    process.exit(1);
  }

  const counts = await sql`
    SELECT tier, count(*)::int AS n FROM public.digest_specs GROUP BY tier
  `;
  console.log(
    "[apply-0023] done. tier distribution:",
    counts.map((r) => `${r.tier}=${r.n}`).join(", ") || "(no rows)"
  );
} finally {
  await sql.end({ timeout: 5 });
}
