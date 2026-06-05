/**
 * Migration 0024 post-SQL seed pass.
 *
 * For every digest_specs row with status='active' and next_run_at IS NULL,
 * parse the (just-backfilled) scheduling jsonb through Zod, compute the
 * canonical nextRunAt(rule, now()) via the JS evaluator, and persist.
 *
 * Runs via tsx so we can reuse the production evaluator without a build
 * step. Safe to re-run — idempotent UPDATE narrowed to NULL next_run_at.
 *
 * Usage (called by apply-0024.mjs after the SQL block applies):
 *   cd apps/web && npx tsx --env-file=.env.local server/db/seed-next-run-0024.ts
 */
import postgres from "postgres";
import { schedulingRuleV1 } from "../../lib/scheduling/rule";
import { nextRunAt } from "../../lib/scheduling/evaluator";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[seed-next-run-0024] DATABASE_URL not set.");
  process.exit(1);
}

interface Row {
  id: string;
  scheduling: unknown;
}

async function main() {
  const sql = postgres(DATABASE_URL!, { prepare: false, max: 1 });
  try {
  const rows: Row[] = await sql<Row[]>`
    SELECT id, scheduling
    FROM public.digest_specs
    WHERE status = 'active' AND next_run_at IS NULL
  `;

  console.log(`[seed-next-run-0024] candidates: ${rows.length} active rows with NULL next_run_at`);

  const now = new Date();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const parsed = schedulingRuleV1.safeParse(row.scheduling);
    if (!parsed.success) {
      console.warn(`[seed-next-run-0024] spec ${row.id}: scheduling failed Zod parse — ${parsed.error.message}`);
      skipped++;
      continue;
    }
    const next = nextRunAt(parsed.data, now);
    if (!next) {
      console.warn(`[seed-next-run-0024] spec ${row.id}: nextRunAt returned null (endDate past?)`);
      skipped++;
      continue;
    }
    await sql`
      UPDATE public.digest_specs
      SET next_run_at = ${next}, updated_at = now()
      WHERE id = ${row.id}
    `;
    updated++;
  }

  console.log(`[seed-next-run-0024] done. updated=${updated} skipped=${skipped}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[seed-next-run-0024] failed:", err);
  process.exit(1);
});
