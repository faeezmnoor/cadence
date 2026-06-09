// Wave 3 / CAD-180 — apply migration 0025 (chat telemetry tables).
//
// Adds two append-only tables:
//   - chat_turn_event       (parity work, CAD-181)
//   - spec_extraction_event (context-pickup work, CAD-182)
//
// Idempotent: CREATE TABLE IF NOT EXISTS + guarded RLS policy creation.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0025.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0025] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0025] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0025_chat_telemetry.sql"),
  "utf8"
);

try {
  console.log("[apply-0025] applying 0025_chat_telemetry.sql ...");
  await sql.unsafe(ddl);

  for (const tbl of ["chat_turn_event", "spec_extraction_event"]) {
    const rows = await sql`
      SELECT to_regclass(${"public." + tbl}) AS reg
    `;
    if (!rows[0]?.reg) await fail(`table ${tbl} missing after migration`);
  }
  console.log("[apply-0025] OK: chat_turn_event + spec_extraction_event present.");
} catch (err) {
  console.error("[apply-0025] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0025] done.");
