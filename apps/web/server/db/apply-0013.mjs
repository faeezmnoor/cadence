// T-506b: One-shot apply of migration 0013 (trial grant on signup).
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0013.mjs
//
// drizzle-kit migrate is broken (claims 0011 not applied when it is) —
// apply 0013 SQL directly via the postgres client.
//
// Idempotent: the function redefine + trigger drop+create + backfill
// loop all gate on trial_credits_granted_at IS NULL. Safe to re-run.

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/apply-0013.mjs"
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });
const migrationPath = path.join(
  import.meta.dirname,
  "migrations/0013_trial_grant_on_signup.sql"
);
const ddl = readFileSync(migrationPath, "utf8");

try {
  // Pre-state snapshot: how many users already granted?
  const pre = await sql`
    SELECT
      COUNT(*) FILTER (WHERE trial_credits_granted_at IS NOT NULL) AS granted,
      COUNT(*) FILTER (WHERE trial_credits_granted_at IS NULL)     AS pending,
      COUNT(*)                                                     AS total
    FROM public.users
  `;
  console.log(
    `[apply-0013] pre: total=${pre[0].total} granted=${pre[0].granted} pending=${pre[0].pending}`
  );

  console.log("[apply-0013] applying 0013_trial_grant_on_signup.sql ...");
  await sql.unsafe(ddl);
  console.log("[apply-0013] migration applied");

  // Sanity: trigger exists and points at our function.
  const trig = await sql`
    SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  `;
  console.log(`[apply-0013] trigger rows: ${trig.length}`);
  for (const t of trig) console.log(`  ${t.tgname}: ${t.def}`);

  // Sanity: function source mentions trial_grant + source=signup.
  const fn = await sql`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_auth_user'
  `;
  if (fn.length === 0) {
    throw new Error("handle_new_auth_user function not found after migration");
  }
  const def = fn[0].def;
  const hasTrialGrant = def.includes("'trial_grant'");
  const hasSourceSignup = def.includes("'signup'");
  console.log(
    `[apply-0013] function has trial_grant=${hasTrialGrant} source=signup=${hasSourceSignup}`
  );
  if (!hasTrialGrant || !hasSourceSignup) {
    throw new Error("handle_new_auth_user does not contain expected grant logic");
  }

  // Post-state: backfill should have moved all pending → granted.
  const post = await sql`
    SELECT
      COUNT(*) FILTER (WHERE trial_credits_granted_at IS NOT NULL) AS granted,
      COUNT(*) FILTER (WHERE trial_credits_granted_at IS NULL)     AS pending,
      COUNT(*)                                                     AS total
    FROM public.users
  `;
  console.log(
    `[apply-0013] post: total=${post[0].total} granted=${post[0].granted} pending=${post[0].pending}`
  );

  // Ledger probe: how many backfill rows did we just write?
  const backfillRows = await sql`
    SELECT COUNT(*) AS n
    FROM public.transactions
    WHERE type = 'trial_grant'
      AND metadata->>'source' = 'backfill_0013'
  `;
  console.log(`[apply-0013] backfill ledger rows: ${backfillRows[0].n}`);

  console.log("[apply-0013] done");
} catch (err) {
  console.error("[apply-0013] FAILED:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
