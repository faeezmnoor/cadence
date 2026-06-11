/**
 * Brief manage mode — migration 0029 wiring invariants (plan §4.1, §6).
 *
 * Structural / source-regex tests, the sanctioned exception pattern
 * (see test/pro-tier-spec-tier.test.ts and CLAUDE.md "Testing philosophy"):
 * the contract here is multi-file (two SQL phases + apply script + schema.ts
 * mirror) and the load-bearing invariant — "the pre-merge schema phase
 * contains NO status UPDATE" (exec RC1/RC4) — must be checkable in CI
 * without a database.
 *
 * The behavioural fixtures from plan §6's migration row (jsonb-null
 * savedSpecId skip, two-sided ambiguity rule, per-phase double-run
 * idempotency, reactivation NOT-EXISTS skip) require a real Postgres and
 * are scripted for the ship operator in scripts/REHEARSAL-0029.md — no
 * DATABASE_URL exists in this environment by design.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

/** SQL with `--` comments stripped — prose must never mask or trip a guard. */
function stripSqlComments(sqlText: string): string {
  return sqlText.replace(/--[^\n]*/g, "");
}

describe("0029 phase 1 — schema + backfill (pre-merge, inert)", () => {
  const raw = read("server/db/migrations/0029_chat_thread_spec_binding.sql");
  const sql = stripSqlComments(raw);

  it("contains NO status UPDATE on any path (exec RC1/RC4)", () => {
    expect(sql).not.toMatch(/SET\s+status/i);
  });

  it("adds nullable spec_id with ON DELETE SET NULL (idempotent)", () => {
    expect(sql).toMatch(
      /ALTER TABLE chat_threads\s+ADD COLUMN IF NOT EXISTS spec_id uuid REFERENCES digest_specs\(id\) ON DELETE SET NULL/
    );
  });

  it("creates the partial lookup index", () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_chat_threads_spec\s+ON chat_threads \(spec_id\) WHERE spec_id IS NOT NULL/
    );
  });

  it("backfill uses the two-sided DISTINCT ON ambiguity rule (PM risk 7)", () => {
    // (a) per THREAD: latest savedSpecId wins.
    expect(sql).toMatch(/DISTINCT ON \(m\.thread_id\)/);
    expect(sql).toMatch(/ORDER BY m\.thread_id, m\.created_at DESC/);
    // (b) per SPEC: most recent thread wins (unique-index prereq).
    expect(sql).toMatch(/DISTINCT ON \(sid\)/);
    expect(sql).toMatch(/ORDER BY sid, created_at DESC/);
  });

  it("backfill skips jsonb-null savedSpecId via the ->> IS NOT NULL predicate (advisory 7)", () => {
    // content->>'savedSpecId' returns SQL NULL for {"savedSpecId": null},
    // so this predicate alone covers the jsonb-null fixture.
    expect(sql).toMatch(/m\.content->>'savedSpecId' IS NOT NULL/);
    expect(sql).toMatch(/m\.role = 'assistant'/);
  });

  it("backfill cross-checks ownership via digest_specs.user_id", () => {
    expect(sql).toMatch(
      /EXISTS \(SELECT 1 FROM digest_specs s\s+WHERE s\.id = b\.sid AND s\.user_id = t\.user_id\)/
    );
  });

  it("backfill only fills NULL spec_id (idempotent re-run is a no-op)", () => {
    expect(sql).toMatch(/t\.spec_id IS NULL/);
  });

  it("creates the one-live-manage-thread-per-brief partial unique index (advisory 9)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_spec_active_uq\s+ON chat_threads \(spec_id\) WHERE spec_id IS NOT NULL AND status = 'active'/
    );
  });

  it("adds users.last_sample_dry_run_at throttle column (exec RC6)", () => {
    expect(sql).toMatch(
      /ALTER TABLE users\s+ADD COLUMN IF NOT EXISTS last_sample_dry_run_at timestamptz/
    );
  });
});

describe("0029b phase 2 — reactivation (post-deploy only)", () => {
  const raw = read("server/db/migrations/0029b_reactivate_manage_threads.sql");
  const sql = stripSqlComments(raw);

  it("reactivates only completed, spec-bound threads with a live spec", () => {
    expect(sql).toMatch(/SET status = 'active', updated_at = now\(\)/);
    expect(sql).toMatch(/t\.spec_id = s\.id AND t\.status = 'completed'/);
    expect(sql).toMatch(/s\.status IN \('active','paused'\)/);
  });

  it("carries the NOT EXISTS guard against an existing active bound thread", () => {
    expect(sql).toMatch(
      /NOT EXISTS \(SELECT 1 FROM chat_threads t2\s+WHERE t2\.spec_id = t\.spec_id AND t2\.status = 'active'\)/
    );
  });

  it("touches nothing but chat_threads.status/updated_at (single UPDATE)", () => {
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^UPDATE chat_threads t/);
  });
});

describe("apply-0029.mjs — phased runner", () => {
  const runner = read("server/db/apply-0029.mjs");

  it("supports exactly the three phases with schema as default", () => {
    expect(runner).toMatch(/const PHASES = \["schema", "reactivate", "rollback"\]/);
    expect(runner).toMatch(/: "schema";/);
  });

  it("schema phase reads only the phase-1 file and self-guards against status writes", () => {
    // The 0029b file is LOADED exactly once — inside the reactivate phase
    // (comments/log lines may mention it; readMigration may not).
    const refs = runner.match(/readMigration\("0029b_reactivate_manage_threads\.sql"\)/g) ?? [];
    expect(refs).toHaveLength(1);
    expect(runner).toMatch(
      /runReactivatePhase\(\) \{[\s\S]*?0029b_reactivate_manage_threads\.sql/
    );
    // Comment-stripped guard: refuses to apply a schema file with SET status.
    expect(runner).toMatch(/replace\(\/--\[\^\\n\]\*\/g, ""\)/);
    expect(runner).toMatch(/SET\\s\+status/);
  });

  it("schema phase proves no status drift via before/after status counts", () => {
    expect(runner).toMatch(/statusBefore/);
    expect(runner).toMatch(/statusAfter/);
    expect(runner).toMatch(/status counts changed during schema phase/);
  });

  it("rollback phase is the reactivation inverse (plan §7.2)", () => {
    expect(runner).toMatch(/SET status = 'completed', updated_at = now\(\)/);
    expect(runner).toMatch(/WHERE spec_id IS NOT NULL AND status = 'active'/);
  });

  it("verifies its objects post-apply (columns + indexes)", () => {
    expect(runner).toMatch(/information_schema\.columns/);
    expect(runner).toMatch(/pg_indexes/);
    expect(runner).toMatch(/last_sample_dry_run_at/);
    expect(runner).toMatch(/chat_threads_spec_active_uq/);
  });
});

describe("schema.ts mirror", () => {
  const schema = read("server/db/schema.ts");

  it("chatThreads declares specId with ON DELETE SET NULL", () => {
    expect(schema).toMatch(
      /specId: uuid\("spec_id"\)\.references\(\(\) => digestSpecs\.id, \{ onDelete: "set null" \}\)/
    );
  });

  it("chatThreads mirrors both 0029 indexes", () => {
    expect(schema).toMatch(/idx_chat_threads_spec/);
    expect(schema).toMatch(/chat_threads_spec_active_uq/);
  });

  it("users declares lastSampleDryRunAt", () => {
    expect(schema).toMatch(
      /lastSampleDryRunAt: timestamp\("last_sample_dry_run_at", \{ withTimezone: true \}\)/
    );
  });
});
