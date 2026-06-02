// QA P0 #1: Apply migration 0019 (language_interest_events RLS).
//
// Mirrors apply-0018 — read SQL, apply, verify RLS is enabled on the table.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0019.mjs

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
  path.join(
    import.meta.dirname,
    "migrations/0019_language_interest_events_rls.sql"
  ),
  "utf8"
);

try {
  console.log("[apply-0019] applying 0019_language_interest_events_rls.sql ...");
  await sql.unsafe(ddl);

  const rls = await sql`
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.language_interest_events'::regclass
  `;
  if (!rls[0]?.relrowsecurity) {
    console.error("[apply-0019] FAIL: RLS not enabled on language_interest_events");
    process.exit(1);
  }

  const policies = await sql`
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.language_interest_events'::regclass
    ORDER BY polname
  `;
  const names = policies.map((p) => p.polname);
  const required = ["language_interest_self_insert", "language_interest_self_select"];
  for (const r of required) {
    if (!names.includes(r)) {
      console.error(`[apply-0019] FAIL: missing policy ${r}`);
      process.exit(1);
    }
  }

  console.log("[apply-0019] done. policies:", names.join(", "));
} finally {
  await sql.end({ timeout: 5 });
}
