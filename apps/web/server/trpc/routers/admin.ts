/**
 * admin.* — admin-only diagnostic + ops routes.
 *
 * T-304 (CAD-39): admin.listRuns — paginated runs viewer.
 *
 * Auth: every procedure here MUST go through `adminProcedure` so that:
 *   - signed-out  -> 401 UNAUTHORIZED
 *   - signed-in but not in CADENCE_ADMIN_EMAILS -> 403 FORBIDDEN
 *
 * Cursor pagination on (created_at DESC, id DESC) — id breaks ties so the
 * cursor is stable across rows created within the same millisecond. We use
 * the runs `idx_digest_runs_user_created` index on created_at; that one is
 * (user_id, created_at DESC) so a global created_at-desc scan still falls
 * back to a btree scan but is fine at our row counts.
 *
 * Filter:
 *   - brokenOnly: only return runs whose owning user is currently
 *     state='delivery_broken'. Lets us triage stuck users at a glance.
 */
import { z } from "zod";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import { adminProcedure, router } from "../trpc";

const LIST_RUNS_DEFAULT_LIMIT = 25;
const LIST_RUNS_MAX_LIMIT = 100;
const LAST_ERROR_TRUNCATE = 200;

export const adminRouter = router({
  /**
   * Paginated runs list, newest first.
   *
   * `cursor` is the opaque (createdAt iso, id) pair from the previous page's
   * `nextCursor`. Pass `undefined` for the first page.
   */
  listRuns: adminProcedure
    .input(
      z
        .object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(LIST_RUNS_MAX_LIMIT)
            .default(LIST_RUNS_DEFAULT_LIMIT),
          brokenOnly: z.boolean().default(false),
          cursor: z
            .object({
              createdAt: z.string(), // ISO
              id: z.string().uuid(),
            })
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? LIST_RUNS_DEFAULT_LIMIT;
      const brokenOnly = input?.brokenOnly ?? false;
      const cursor = input?.cursor;

      const whereParts = [];
      if (brokenOnly) {
        whereParts.push(eq(users.state, "delivery_broken"));
      }
      if (cursor) {
        const cursorDate = new Date(cursor.createdAt);
        // (createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt AND id < cursor.id)
        whereParts.push(
          or(
            lt(digestRuns.createdAt, cursorDate),
            and(eq(digestRuns.createdAt, cursorDate), lt(digestRuns.id, cursor.id))
          )!
        );
      }

      const rows = await db
        .select({
          id: digestRuns.id,
          status: digestRuns.status,
          runDate: digestRuns.runDate,
          deliveryMinuteUtc: digestRuns.deliveryMinuteUtc,
          attemptCount: digestRuns.attemptCount,
          lastError: sql<string | null>`
            CASE
              WHEN ${digestRuns.lastError} IS NULL THEN NULL
              ELSE substring(${digestRuns.lastError} from 1 for ${LAST_ERROR_TRUNCATE})
            END
          `,
          telegramMessageId: digestRuns.telegramMessageId,
          costUsd: digestRuns.costUsd,
          createdAt: digestRuns.createdAt,
          specId: digestRuns.specId,
          specVersion: digestSpecs.version,
          userId: users.id,
          userEmail: users.email,
          userState: users.state,
        })
        .from(digestRuns)
        .innerJoin(users, eq(users.id, digestRuns.userId))
        .innerJoin(digestSpecs, eq(digestSpecs.id, digestRuns.specId))
        .where(whereParts.length > 0 ? and(...whereParts) : undefined)
        .orderBy(desc(digestRuns.createdAt), desc(digestRuns.id))
        .limit(limit + 1);

      let nextCursor: { createdAt: string; id: string } | null = null;
      if (rows.length > limit) {
        const last = rows[limit - 1]!;
        nextCursor = { createdAt: last.createdAt.toISOString(), id: last.id };
      }
      return {
        rows: rows.slice(0, limit),
        nextCursor,
      };
    }),
});
