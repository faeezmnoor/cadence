// Stream E #6 (CAD-Stream-E): Apply migration 0017 (digest_runs.short_id) directly.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0017.mjs
//
// drizzle-kit migrate is broken in this project; we apply via the postgres
// client directly. DDL is idempotent (IF NOT EXISTS). After the DDL, we
// backfill any rows that still have NULL short_id with random 12-char
// nanoid-style ids.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0017.mjs"
  );
  process.exit(1);
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function shortId(len = 12) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0017_digest_runs_short_id.sql"),
  "utf8"
);

try {
  console.log("[apply-0017] applying 0017_digest_runs_short_id.sql ...");
  await sql.unsafe(ddl);

  // Verify column.
  const col = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='digest_runs' AND column_name='short_id'
  `;
  if (col.length === 0) {
    console.error("[apply-0017] FAIL: short_id column missing after DDL");
    process.exit(1);
  }

  // Backfill NULL rows.
  const nullRows = await sql`SELECT id FROM public.digest_runs WHERE short_id IS NULL`;
  console.log(`[apply-0017] backfilling ${nullRows.length} rows with random shortIds`);
  for (const row of nullRows) {
    // Try until we don't hit the unique index.
    for (let attempt = 0; attempt < 5; attempt++) {
      const sid = shortId(12);
      try {
        await sql`UPDATE public.digest_runs SET short_id = ${sid} WHERE id = ${row.id} AND short_id IS NULL`;
        break;
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
  }

  console.log("[apply-0017] done.");
} finally {
  await sql.end({ timeout: 5 });
}
