// One-shot apply of migration 0010 (T-015 / CAD-59:
// FK public.users.id -> auth.users.id ON DELETE CASCADE).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0010.mjs
//
// Idempotent: the migration is a DO block that no-ops if the FK already
// exists. If orphaned public.users rows are detected, the migration
// aborts with RAISE EXCEPTION listing them — resolve manually and re-run.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0010.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0010_users_fk_auth_users.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  console.log("[apply-0010] pre-flight orphan check ...");
  const orphans = await sql`
    SELECT u.id, u.email
    FROM public.users u
    WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  `;
  console.log(`[apply-0010] orphans: ${orphans.length}`);
  if (orphans.length > 0) {
    console.log(orphans);
  }

  console.log("[apply-0010] running 0010_users_fk_auth_users.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0010] ok");

  const verify = await sql`
    SELECT tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'users'
      AND tc.constraint_name = 'users_id_auth_users_id_fk'
  `;
  console.log("[apply-0010] verify FK:", verify);
} catch (err) {
  console.error("[apply-0010] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
