/**
 * Security HIGH #4 — PDPA-aligned deletion of soft-deleted users' brief content.
 *
 * Privacy page (/privacy) promises:
 *   "we remove your spec, feedback, and brief history within 30 days."
 *
 * Account soft-deletion stamps `users.deleted_at` but historically left
 * `digest_runs.composed_markdown` (and the URL list in
 * `metadata.sourceResolve.results`) on disk indefinitely. That violates the
 * promise. This function delivers on it: every day at 03:00 MYT it nulls
 * out reader-facing PII on any digest_runs row whose owner has been
 * soft-deleted for more than 30 days.
 *
 * What we scrub:
 *   - composed_markdown        -> NULL (the brief body itself)
 *   - metadata.sourceResolve.results -> removed (a list of URLs the user
 *     was reading; reader-facing PII per the same promise)
 *
 * What we leave behind (intentionally — not reader-facing content):
 *   - the digest_runs row itself (status, cost, latency are audit data)
 *   - metadata.sourceResolve.rate / .checkedAt (aggregate stats only)
 *   - metadata.manualRating (founder-internal, not user content)
 *   - sources_bundle (model context, not reader-facing brief text — but
 *     we treat it as PII below and null it too for safety)
 *
 * Surface implications:
 *   - /b/<shortId> already 404s when composed_markdown IS NULL
 *     (apps/web/app/b/[shortId]/page.tsx line 73). No change needed.
 *   - /admin/runs/[id] now renders "Brief content removed per PDPA
 *     deletion" instead of the legacy "pre-compose failure" copy when the
 *     run belongs to a soft-deleted user. See run-detail-client.tsx.
 *
 * Idempotency:
 *   The WHERE clause filters composed_markdown IS NOT NULL, so re-running
 *   the cron after a successful scrub is a no-op. Safe to retry.
 */
import { sql } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db/client";

/**
 * Exported for unit tests. Executes the scrub via the supplied database
 * handle and returns the number of rows touched. We use a single UPDATE
 * with `RETURNING id` so the row count comes back from one round-trip.
 */
export async function purgeSoftDeletedBriefs(
  database: typeof db = db
): Promise<{ scrubbedCount: number }> {
  // Subquery: users soft-deleted more than 30 days ago. Postgres' interval
  // arithmetic is exact, so we don't compute the cutoff in JS (avoids
  // clock-skew between Inngest worker and DB).
  const result = await database.execute<{ id: string }>(sql`
    UPDATE digest_runs
       SET composed_markdown = NULL,
           sources_bundle = NULL,
           metadata = metadata #- '{sourceResolve,results}',
           updated_at = now()
     WHERE user_id IN (
             SELECT id
               FROM users
              WHERE deleted_at IS NOT NULL
                AND deleted_at < now() - interval '30 days'
           )
       AND composed_markdown IS NOT NULL
     RETURNING id
  `);

  // drizzle's execute returns { rows } for pg / { rowCount } depending on
  // driver. We support both shapes so the function works against the
  // real Supabase driver and the test fake.
  const rows =
    (result as unknown as { rows?: Array<{ id: string }> }).rows ??
    (Array.isArray(result) ? (result as Array<{ id: string }>) : []);
  return { scrubbedCount: rows.length };
}

export const purgeSoftDeletedBriefs_fn = inngest.createFunction(
  {
    id: "purge-soft-deleted-briefs",
    name: "Purge soft-deleted users' brief content (PDPA 30d)",
    concurrency: { limit: 1 },
    triggers: [
      // 03:00 MYT = 19:00 UTC (MYT is UTC+8, no DST).
      // Chosen to run in the quietest window — well clear of the 07:00 MYT
      // live-commerce brief and the 09:00 MYT smoke summary.
      { cron: "0 19 * * *" },
    ],
  },
  async ({ step, logger }) => {
    const { scrubbedCount } = await step.run("purge", async () => {
      return purgeSoftDeletedBriefs();
    });

    logger.info("purge-soft-deleted-briefs: complete", {
      scrubbedCount,
      runAtIso: new Date().toISOString(),
    });

    return { scrubbedCount };
  }
);
