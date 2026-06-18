// CAD-165 / CAD-228 — apply migration 0031 (per-spec web-search provider).
//
// Adds digest_specs.searcher (default 'brave') + a CHECK vocabulary that
// grows per registered provider (same in-place pattern as 0023/0027 tier).
//
// Idempotent: ADD COLUMN IF NOT EXISTS + the DO block drops/re-adds the
// constraint; re-running converges to the same state.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0031.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0031] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0031] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0031_digest_specs_searcher.sql"),
  "utf8"
);

try {
  console.log("[apply-0031] applying 0031_digest_specs_searcher.sql ...");
  await sql.unsafe(ddl);

  // Verify: column exists + the CHECK constraint carries the full vocabulary.
  const col = await sql`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_name = 'digest_specs' AND column_name = 'searcher'
  `;
  if (col.length === 0) await fail("digest_specs.searcher missing after migration");

  const rows = await sql`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'digest_specs_searcher_check'
  `;
  if (rows.length === 0) await fail("digest_specs_searcher_check missing after migration");
  const def = rows[0].def;
  for (const v of ["brave", "duckduckgo"]) {
    if (!def.includes(`'${v}'`)) await fail(`constraint predicate missing '${v}': ${def}`);
  }
  console.log(`[apply-0031] OK: searcher default=${col[0].column_default} ${def}`);
} catch (err) {
  console.error("[apply-0031] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0031] done.");
