// Multi-brief Phase A — apply migration 0024 + seed next_run_at for active rows.
//
// Two-stage runner:
//   1. SQL block (0024_digest_specs_multi_brief.sql) — schema + backfill of
//      status / name / scheduling / archived_at on every digest_specs row.
//   2. JS seed pass (seed-next-run-0024.ts via tsx) — computes next_run_at
//      for every active row using the canonical scheduling evaluator.
//
// Idempotent: re-running on a post-0024 DB is a no-op (UPDATE narrowed to
// NULL status/name/scheduling; ADD COLUMN IF NOT EXISTS; ADD CONSTRAINT
// guarded by DO/IF NOT EXISTS).
//
// Verifies post-apply that:
//   - all new columns exist on digest_specs
//   - every row has non-null status, name, scheduling
//   - status check constraint is enforced
//   - active row count matches the previous is_current=true count
//     (preserves single-brief semantics for pre-multi-brief users)
//   - chat_threads.status check constraint exists
//   - active rows have populated next_run_at after the seed pass
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0024.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0024] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0024] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

const ddl = readFileSync(
  path.join(import.meta.dirname, "migrations/0024_digest_specs_multi_brief.sql"),
  "utf8"
);

try {
  // Snapshot of active-by-is_current before the migration, so we can verify
  // status='active' lands on the same set of rows.
  const beforeActive = await sql`
    SELECT count(*)::int AS n FROM public.digest_specs WHERE is_current = true
  `;
  const expectedActive = beforeActive[0]?.n ?? 0;

  console.log("[apply-0024] applying 0024_digest_specs_multi_brief.sql ...");
  await sql.unsafe(ddl);

  // Columns present?
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'digest_specs'
      AND column_name IN ('status','name','scheduling','next_run_at','paused_at','archived_at')
    ORDER BY column_name
  `;
  const colSet = new Set(cols.map((c) => c.column_name));
  for (const c of ["status", "name", "scheduling", "next_run_at", "paused_at", "archived_at"]) {
    if (!colSet.has(c)) await fail(`column digest_specs.${c} missing`);
  }

  // No nulls on status / name / scheduling
  const nulls = await sql`
    SELECT
      count(*) FILTER (WHERE status IS NULL)::int AS null_status,
      count(*) FILTER (WHERE name IS NULL)::int AS null_name,
      count(*) FILTER (WHERE scheduling IS NULL)::int AS null_scheduling
    FROM public.digest_specs
  `;
  if ((nulls[0]?.null_status ?? 0) > 0) await fail(`${nulls[0].null_status} rows have NULL status`);
  if ((nulls[0]?.null_name ?? 0) > 0) await fail(`${nulls[0].null_name} rows have NULL name`);
  if ((nulls[0]?.null_scheduling ?? 0) > 0) await fail(`${nulls[0].null_scheduling} rows have NULL scheduling`);

  // status CHECK constraint
  const cons = await sql`
    SELECT conname FROM pg_constraint WHERE conname = 'digest_specs_status_chk'
  `;
  if (cons.length === 0) await fail("digest_specs_status_chk constraint missing");

  // chat_threads.status CHECK
  const chatCons = await sql`
    SELECT conname FROM pg_constraint WHERE conname = 'chat_threads_status_chk'
  `;
  if (chatCons.length === 0) await fail("chat_threads_status_chk constraint missing");

  // Active count preserved
  const afterActive = await sql`
    SELECT count(*)::int AS n FROM public.digest_specs WHERE status = 'active'
  `;
  const actualActive = afterActive[0]?.n ?? 0;
  if (actualActive !== expectedActive) {
    await fail(
      `active count mismatch: pre-migration is_current=true was ${expectedActive}, post-migration status='active' is ${actualActive}`
    );
  }
  console.log(`[apply-0024] OK: schema + backfill. active=${actualActive} expected=${expectedActive}`);

  // Status distribution for the log line
  const dist = await sql`
    SELECT status, count(*)::int AS n FROM public.digest_specs GROUP BY status ORDER BY status
  `;
  console.log(
    `[apply-0024] status distribution: ${
      dist.map((r) => `${r.status}=${r.n}`).join(", ") || "(no rows)"
    }`
  );
} catch (err) {
  console.error("[apply-0024] SQL stage failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });

// Stage 2: seed next_run_at via the canonical evaluator (tsx + production lib).
console.log("[apply-0024] seeding next_run_at via scheduling evaluator ...");
const tsxBin = path.join(import.meta.dirname, "..", "..", "node_modules", ".bin", "tsx");
const seedScript = path.join(import.meta.dirname, "seed-next-run-0024.ts");
const envFile = path.join(import.meta.dirname, "..", "..", ".env.local");
const res = spawnSync(tsxBin, [`--env-file=${envFile}`, seedScript], {
  stdio: "inherit",
  cwd: path.join(import.meta.dirname, "..", ".."),
});
if (res.status !== 0) {
  console.error(`[apply-0024] seed-next-run-0024.ts exited with ${res.status}`);
  process.exit(1);
}

// Stage 3: post-seed verification.
const sql2 = postgres(DATABASE_URL, { prepare: false, max: 1 });
try {
  const stranded = await sql2`
    SELECT count(*)::int AS n
    FROM public.digest_specs
    WHERE status = 'active' AND next_run_at IS NULL
  `;
  const n = stranded[0]?.n ?? 0;
  if (n > 0) {
    console.warn(
      `[apply-0024] WARN: ${n} active row(s) still have NULL next_run_at — dispatcher will skip them until a write recomputes`
    );
  } else {
    console.log("[apply-0024] OK: every active row has next_run_at populated");
  }
} finally {
  await sql2.end({ timeout: 5 });
}

console.log("[apply-0024] done.");
