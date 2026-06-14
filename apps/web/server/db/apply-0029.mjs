// Brief manage mode — apply migration 0029 (chat_threads ↔ digest_specs
// binding) in two phases, plus an emergency rollback (plan §4.1, §7.1, §7.2).
//
//   --phase=schema (default)
//       Phase 1, PRE-MERGE prod apply. Runs 0029_chat_thread_spec_binding.sql:
//       spec_id column + FK, lookup index, savedSpecId backfill (two-sided
//       DISTINCT ON ambiguity rule), partial unique index, and the
//       users.last_sample_dry_run_at throttle column. Contains NO status
//       UPDATE on any path (exec RC1/RC4 — this script never reads 0029b in
//       this phase, and 0029 itself has none).
//
//   --phase=reactivate
//       Phase 2, POST-DEPLOY ONLY (new code serving, MANAGE_MODE on). Runs
//       0029b_reactivate_manage_threads.sql: flips backfilled bound threads
//       with a live spec back to status='active', skipping any spec that
//       already has an active thread (NOT EXISTS guard).
//
//   --phase=rollback
//       Inverse of reactivation. REQUIRED before any post-reactivation
//       `git revert` (plan §7.2): sets every spec-bound active thread back
//       to 'completed' so reverted legacy code never resumes them.
//
// Idempotent: each phase converges — run it twice, the second run reports
// 0 changes. Verifies its objects post-apply and prints counts.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/apply-0029.mjs [--phase=schema|reactivate|rollback]

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const PHASES = ["schema", "reactivate", "rollback"];
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const phase = phaseArg ? phaseArg.slice("--phase=".length) : "schema";
if (!PHASES.includes(phase)) {
  console.error(`[apply-0029] unknown phase '${phase}' — use --phase=${PHASES.join("|")}`);
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[apply-0029] DATABASE_URL not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function fail(msg) {
  console.error(`[apply-0029] FAIL: ${msg}`);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

function readMigration(file) {
  return readFileSync(path.join(import.meta.dirname, "migrations", file), "utf8");
}

async function statusCounts() {
  const rows = await sql`
    SELECT status, count(*)::int AS n FROM chat_threads GROUP BY status ORDER BY status
  `;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

async function boundCount() {
  const rows = await sql`
    SELECT count(*)::int AS n FROM chat_threads WHERE spec_id IS NOT NULL
  `;
  return rows[0].n;
}

async function runSchemaPhase() {
  // Phase 1 contains NO status UPDATE — prove it by snapshotting status
  // counts before/after and failing loudly on any drift (exec RC1/RC4).
  const statusBefore = await statusCounts();

  // Pre-run bound count. On the first apply against a pre-0029 DB the spec_id
  // column does not exist yet, so the count is definitionally 0 — guard the
  // probe on column existence rather than blindly SELECTing spec_id (which
  // throws 42703 and aborts the whole schema phase before any DDL runs).
  const specIdExists = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_threads' AND column_name = 'spec_id'
  `;
  const boundBefore = specIdExists.length > 0 ? await boundCount() : 0;

  const ddl = readMigration("0029_chat_thread_spec_binding.sql");
  // Belt-and-braces (exec RC1/RC4): refuse if anyone ever edits a status
  // write into the schema phase. Strip `--` comments so prose can't mask it.
  const ddlNoComments = ddl.replace(/--[^\n]*/g, "");
  if (/SET\s+status/i.test(ddlNoComments)) {
    await fail("0029 schema file contains a status UPDATE — refusing to apply (exec RC1/RC4).");
  }

  console.log("[apply-0029] phase=schema: applying 0029_chat_thread_spec_binding.sql ...");
  await sql.unsafe(ddl);

  // Verify objects.
  for (const [tbl, col] of [
    ["chat_threads", "spec_id"],
    ["users", "last_sample_dry_run_at"],
  ]) {
    const rows = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tbl} AND column_name = ${col}
    `;
    if (rows.length === 0) await fail(`column ${tbl}.${col} missing after migration`);
  }
  for (const idx of ["idx_chat_threads_spec", "chat_threads_spec_active_uq"]) {
    const rows = await sql`
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${idx}
    `;
    if (rows.length === 0) await fail(`index ${idx} missing after migration`);
  }

  const statusAfter = await statusCounts();
  if (JSON.stringify(statusBefore) !== JSON.stringify(statusAfter)) {
    await fail(
      `status counts changed during schema phase — before=${JSON.stringify(statusBefore)} after=${JSON.stringify(statusAfter)}`
    );
  }

  const boundAfter = await boundCount();

  // Ambiguity-rule audit: candidates that did NOT get bound. Two buckets:
  //   - per-spec losers (another, more recent thread won the same spec)
  //   - ownership/missing-spec skips (spec deleted or cross-user)
  // Both are covered by lazy-create; we log them for the PR record.
  const losers = await sql`
    WITH per_thread AS (
      SELECT DISTINCT ON (m.thread_id)
             m.thread_id, (m.content->>'savedSpecId')::uuid AS sid, m.created_at
      FROM chat_messages m
      WHERE m.role = 'assistant' AND m.content->>'savedSpecId' IS NOT NULL
      ORDER BY m.thread_id, m.created_at DESC
    )
    SELECT p.thread_id, p.sid
    FROM per_thread p
    JOIN chat_threads t ON t.id = p.thread_id
    WHERE t.spec_id IS DISTINCT FROM p.sid
  `;

  console.log(
    `[apply-0029] OK phase=schema: bound ${boundAfter - boundBefore} thread(s) this run ` +
      `(total bound: ${boundAfter}); ambiguous/skipped candidates: ${losers.length}; ` +
      `status counts unchanged: ${JSON.stringify(statusAfter)}`
  );
  for (const l of losers) {
    console.log(`[apply-0029]   skipped candidate thread=${l.thread_id} spec=${l.sid}`);
  }
  if (boundAfter - boundBefore === 0) {
    console.log("[apply-0029] phase=schema: 0 changes (idempotent re-run).");
  }
}

async function runReactivatePhase() {
  // Sanity: refuse to reactivate if phase 1 never ran.
  const col = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_threads' AND column_name = 'spec_id'
  `;
  if (col.length === 0) {
    await fail("chat_threads.spec_id missing — run --phase=schema first.");
  }

  const skippable = await sql`
    SELECT count(*)::int AS n
    FROM chat_threads t
    JOIN digest_specs s ON t.spec_id = s.id
    WHERE t.status = 'completed' AND s.status IN ('active','paused')
      AND EXISTS (SELECT 1 FROM chat_threads t2
                  WHERE t2.spec_id = t.spec_id AND t2.status = 'active')
  `;

  console.log("[apply-0029] phase=reactivate: applying 0029b_reactivate_manage_threads.sql ...");
  const ddl = readMigration("0029b_reactivate_manage_threads.sql");
  const result = await sql.unsafe(ddl);
  const reactivated = result.count ?? 0;

  console.log(
    `[apply-0029] OK phase=reactivate: reactivated ${reactivated} thread(s); ` +
      `skipped ${skippable[0].n} (spec already has an active thread — NOT EXISTS guard).`
  );
  if (reactivated === 0) {
    console.log("[apply-0029] phase=reactivate: 0 changes (idempotent re-run or nothing eligible).");
  }
}

async function runRollbackPhase() {
  console.log("[apply-0029] phase=rollback: completing all spec-bound active threads ...");
  const result = await sql`
    UPDATE chat_threads
    SET status = 'completed', updated_at = now()
    WHERE spec_id IS NOT NULL AND status = 'active'
  `;
  const n = result.count ?? 0;
  console.log(
    `[apply-0029] OK phase=rollback: set ${n} spec-bound active thread(s) back to 'completed'. ` +
      "Safe to `git revert` the manage-mode merge now (plan §7.2)."
  );
  if (n === 0) {
    console.log("[apply-0029] phase=rollback: 0 changes (idempotent re-run).");
  }
}

try {
  if (phase === "schema") await runSchemaPhase();
  else if (phase === "reactivate") await runReactivatePhase();
  else await runRollbackPhase();
} catch (err) {
  console.error("[apply-0029] failed:", err);
  await sql.end({ timeout: 5 });
  process.exit(1);
}

await sql.end({ timeout: 5 });
console.log("[apply-0029] done.");
