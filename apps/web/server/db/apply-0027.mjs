// CAD-222 post-merge review P0 — apply migration 0027 (tier CHECK widened
// to include 'pro_websearch').
//
// PR #36 shipped the three-stack picker but the DB-level CHECK from 0023
// still only allowed ('default','pro'), so saving the 5-credit option
// failed. This swaps the constraint in place.
//
// Idempotent: the DO block drops the constraint only if present and
// re-adds the widened predicate; re-running converges to the same state.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0027.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0027] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0027] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0027_tier_pro_websearch.sql"),
  "utf8"
);

try {
  console.log("[apply-0027] applying 0027_tier_pro_websearch.sql ...");
  await sql.unsafe(ddl);

  // Verify: the constraint exists and its predicate carries all three values.
  const rows = await sql`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'digest_specs_tier_check'
  `;
  if (rows.length === 0) await fail("digest_specs_tier_check missing after migration");
  const def = rows[0].def;
  for (const v of ["default", "pro", "pro_websearch"]) {
    if (!def.includes(`'${v}'`)) await fail(`constraint predicate missing '${v}': ${def}`);
  }
  console.log(`[apply-0027] OK: ${def}`);
} catch (err) {
  console.error("[apply-0027] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0027] done.");
