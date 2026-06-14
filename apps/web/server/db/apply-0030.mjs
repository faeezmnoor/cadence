// CAD-225 — apply migration 0030 (retire the "pro" / Perplexity A2 stack).
//
// An informed-judge eval proved A2 (pro) grounds worse than standard at 3x
// the price, so it's retired. Existing tier='pro' specs migrate to
// 'default' (bill 1 credit, serve standard — NOT auto-upgraded to the
// 5-credit pro_websearch stack). Idempotent: re-running migrates zero rows.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0030.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0030] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0030] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0030_retire_pro_stack.sql"),
  "utf8"
);

try {
  // Distribution before, for the operator log.
  const before = await sql`
    SELECT tier, COUNT(*)::int AS n FROM public.digest_specs GROUP BY tier ORDER BY tier
  `;
  console.log("[apply-0030] tier distribution before:", before.map((r) => `${r.tier}=${r.n}`).join(" "));

  console.log("[apply-0030] applying 0030_retire_pro_stack.sql ...");
  await sql.unsafe(ddl);

  // Verify: zero 'pro' rows remain.
  const remaining = await sql`
    SELECT COUNT(*)::int AS n FROM public.digest_specs WHERE tier = 'pro'
  `;
  if (remaining[0].n !== 0) await fail(`${remaining[0].n} rows still have tier='pro' after migration`);

  const after = await sql`
    SELECT tier, COUNT(*)::int AS n FROM public.digest_specs GROUP BY tier ORDER BY tier
  `;
  console.log("[apply-0030] tier distribution after:", after.map((r) => `${r.tier}=${r.n}`).join(" "));
  console.log("[apply-0030] OK: no tier='pro' rows remain.");
} catch (err) {
  console.error("[apply-0030] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0030] done.");
