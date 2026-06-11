// Brief-creation revamp PR 1 — apply migration 0026 (template provenance).
//
// Adds nullable template_id columns:
//   - chat_threads.template_id  (stamped at first template submission)
//   - digest_specs.template_id  (copied at confirm_and_save)
//
// Idempotent: ADD COLUMN IF NOT EXISTS only.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0026.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0026] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0026] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0026_template_provenance.sql"),
  "utf8"
);

try {
  console.log("[apply-0026] applying 0026_template_provenance.sql ...");
  await sql.unsafe(ddl);

  for (const [tbl, col] of [
    ["chat_threads", "template_id"],
    ["digest_specs", "template_id"],
  ]) {
    const rows = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tbl} AND column_name = ${col}
    `;
    if (rows.length === 0) await fail(`column ${tbl}.${col} missing after migration`);
  }
  console.log("[apply-0026] OK: chat_threads.template_id + digest_specs.template_id present.");
} catch (err) {
  console.error("[apply-0026] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0026] done.");
