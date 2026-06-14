// CAD-225 — apply migration 0028 (retire the 'pro' research stack).
//
// An informed-judge eval proved the 'pro' (Perplexity Sonar, A2) stack is
// strictly dominated (grounds ~2.0 vs standard's 2.4 at 3x the price), so it
// is retired from the product. This migrates any spec rows still on tier='pro'
// to tier='default' so they bill 1 credit and serve the standard stack — NOT
// auto-upgraded to the 5-credit pro_websearch stack.
//
// The CHECK constraint is intentionally left permissive (0027 still allows
// 'pro') — no constraint change here, so 'pro' stays a valid-but-unused value
// for safety.
//
// Idempotent: the UPDATE matches only tier='pro' rows; once migrated, a
// re-run updates zero rows and converges to the same state.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0028.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0028] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0028] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0028_retire_pro_stack.sql"),
  "utf8"
);

try {
  console.log("[apply-0028] applying 0028_retire_pro_stack.sql ...");
  await sql.unsafe(ddl);

  // Verify: no spec rows remain on the retired 'pro' tier.
  const remaining = await sql`
    SELECT count(*)::int AS n FROM public.digest_specs WHERE tier = 'pro'
  `;
  if (remaining[0].n > 0) {
    await fail(`${remaining[0].n} digest_specs rows still on tier='pro' after migration`);
  }

  const counts = await sql`
    SELECT tier, count(*)::int AS n FROM public.digest_specs GROUP BY tier
  `;
  console.log(
    `[apply-0028] OK: 0 rows on tier='pro'. tier distribution:`,
    counts.map((r) => `${r.tier}=${r.n}`).join(", ") || "(no rows)"
  );
} catch (err) {
  console.error("[apply-0028] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0028] done.");
