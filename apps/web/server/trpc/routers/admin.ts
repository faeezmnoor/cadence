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
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  digestRuns,
  digestSpecs,
  feedbackEvalRuns,
  users,
} from "@/server/db/schema";
import { inngest } from "@/server/inngest/client";
import { adminProcedure, router } from "../trpc";
import { refundForFailedRun } from "@/server/billing/refund";
import { grantCredits } from "@/server/billing/grant";
import { computeStreak } from "@/server/digest/streak";
import { sendEmail } from "@/server/email/send";
import { buildRefundEmail } from "@/server/email/refund-template";

const LIST_RUNS_DEFAULT_LIMIT = 25;
const LIST_RUNS_MAX_LIMIT = 100;
const LAST_ERROR_TRUNCATE = 200;

export const adminRouter = router({
  /**
   * Settings-surfacing v1 (gap 10): grant credits through the ledger.
   * Closes the loop `billing.requestCredits` pings reference ("grant via
   * /admin") — until now that flow didn't exist and grants were raw SQL.
   *
   * Idempotent against duplicate submission via the client-generated
   * `grantId` (checked-before-insert inside the grant transaction — see
   * server/billing/grant.ts). Reachable from the /admin/users rows.
   */
  grantCredits: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        credits: z.number().int().min(1).max(1000),
        /** Client-generated idempotency key (one per grant form open). */
        grantId: z.string().uuid(),
        note: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the target exists first for a clean 404 (grantCredits
      // throws a generic Error mid-transaction otherwise). Review CTO
      // P3-7: soft-deleted users are treated as not found — granting to
      // a deleted account would bump a balance nobody can ever spend.
      const target = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
        .limit(1);
      if (target.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }
      return grantCredits({
        userId: input.userId,
        credits: input.credits,
        grantId: input.grantId,
        grantedBy: ctx.user.email ?? "admin",
        note: input.note,
      });
    }),

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
          specIsSmoke: digestSpecs.isSmoke,
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

  /**
   * T-305 (CAD-40): admin.replayRun — manual override that re-dispatches a
   * specific digest_runs row.
   *
   * Semantics: update-in-place.
   *   - attempt_count -> 0
   *   - last_error    -> NULL
   *   - error         -> NULL
   *   - status        -> 'pending'
   *   - updated_at    -> now()
   *
   * History on prior attempts is intentionally discarded (decision locked
   * with founder 2026-06-02). If we ever need a forensic trail we'll add a
   * `run_attempts` audit table; today the audit is the dispatcher's
   * structured logs + Inngest's own run history.
   *
   * Dispatch path: we emit `digest/run.scheduled` directly with
   * `{ digestRunId, replay: true }`. We deliberately skip the cron
   * dispatcher's (spec_id, delivery_minute_utc) idempotency claim because
   * the row already exists — the claim is for inserting a NEW row, and
   * replay reuses the existing one.
   *
   * The pipeline's auto-heal path (digest/run.ts) flips users.state from
   * 'delivery_broken' back to 'active' on successful delivery, so a
   * successful replay also unbricks the user.
   */
  replayRun: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      // Look up the existing row first so we can 404 cleanly (the update
      // would otherwise return zero rows and we'd lose the distinction
      // between "doesn't exist" and "couldn't update").
      const existing = await db
        .select({
          id: digestRuns.id,
          userId: digestRuns.userId,
          specId: digestRuns.specId,
          runDate: digestRuns.runDate,
          deliveryMinuteUtc: digestRuns.deliveryMinuteUtc,
        })
        .from(digestRuns)
        .where(eq(digestRuns.id, input.runId))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Run ${input.runId} not found.`,
        });
      }
      const row = existing[0]!;

      // In-place reset. status -> 'pending' so the runs viewer reflects the
      // freshly-queued state immediately.
      await db
        .update(digestRuns)
        .set({
          status: "pending",
          attemptCount: 0,
          lastError: null,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(digestRuns.id, row.id));

      // Direct event publish — bypasses the cron claim because the row is
      // already there. The `replay: true` flag is informational so the
      // handler / logs can distinguish replays from cron-driven runs.
      await inngest.send({
        name: "digest/run.scheduled",
        data: {
          userId: row.userId,
          digestRunId: row.id,
          runDate: row.runDate,
          deliveryMinuteUtc: row.deliveryMinuteUtc
            ? row.deliveryMinuteUtc.toISOString()
            : undefined,
          replay: true,
        },
      });

      return { ok: true as const, runId: row.id };
    }),

  /**
   * PM-audit #2: refund a failed digest_runs row by inserting a +1 credit
   * `refund` transaction and emailing the user an apology.
   *
   * Idempotent — re-clicking the button on a row already refunded is a
   * no-op (refundForFailedRun returns refunded=false with
   * reason='already_refunded'). The mutation surfaces that to the UI so
   * the admin sees "already refunded" instead of a fake success.
   *
   * Email send is best-effort: a Resend outage must NOT roll back the
   * credit (the ledger is the source of truth, the email is courtesy).
   */
  refundRun: adminProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        reason: z.string().max(280).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Capture user email + run date for the apology mail
      const runRows = await db
        .select({
          id: digestRuns.id,
          runDate: digestRuns.runDate,
          status: digestRuns.status,
          userEmail: users.email,
        })
        .from(digestRuns)
        .innerJoin(users, eq(users.id, digestRuns.userId))
        .where(eq(digestRuns.id, input.runId))
        .limit(1);
      if (runRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found." });
      }
      const row = runRows[0]!;

      const result = await refundForFailedRun({
        digestRunId: input.runId,
        refundedBy: ctx.user.email ?? "admin",
        reason: input.reason,
      });

      if (!result.refunded) {
        return {
          ok: false as const,
          reason: result.reason,
          balanceAfter: result.balanceAfter,
        };
      }

      // Best-effort apology email. Don't fail the mutation on send error —
      // the credit is already on the user's account and the ledger row
      // is committed.
      try {
        const email = buildRefundEmail({
          runDate: row.runDate ?? "your missed brief",
          balanceAfter: result.balanceAfter!,
          reason: input.reason,
        });
        await sendEmail({
          to: row.userEmail,
          subject: email.subject,
          text: email.text,
        });
      } catch (err) {
        console.warn("[admin.refundRun] email send failed", err);
      }

      return {
        ok: true as const,
        balanceAfter: result.balanceAfter,
        transactionId: result.transactionId,
      };
    }),

  /**
   * T-407 (CAD-48): listFeedbackEvals — newest-first eval rows joined
   * with user email + spec smoke flag so the admin viewer can prioritise
   * the smoke spec.
   *
   * `smokeFirst`: when true (default), rows whose owning user has a
   * current is_smoke spec are surfaced at the top regardless of
   * window_end_date. We sort on a boolean expression then by date.
   *
   * Pagination: simple offset/limit. Rowcount is bounded by the number
   * of distinct (user, window_end_date) pairs — at our scale this stays
   * well under a screen for months.
   */
  listFeedbackEvals: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
          smokeFirst: z.boolean().default(true),
          smokeOnly: z.boolean().default(false),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 50;
      const smokeFirst = input?.smokeFirst ?? true;
      const smokeOnly = input?.smokeOnly ?? false;

      // Sub-correlate: a user "is smoke" if they own at least one
      // current is_smoke spec. Use EXISTS to keep the join tidy.
      const isSmokeExpr = sql<boolean>`EXISTS (
        SELECT 1 FROM ${digestSpecs}
        WHERE ${digestSpecs.userId} = ${feedbackEvalRuns.userId}
          AND ${digestSpecs.isSmoke} = true
          AND ${digestSpecs.isCurrent} = true
      )`;

      const whereParts = [];
      if (smokeOnly) {
        whereParts.push(sql`${isSmokeExpr}`);
      }

      const orderBy = smokeFirst
        ? [desc(isSmokeExpr), desc(feedbackEvalRuns.windowEndDate)]
        : [desc(feedbackEvalRuns.windowEndDate)];

      const rows = await db
        .select({
          userId: feedbackEvalRuns.userId,
          userEmail: users.email,
          windowEndDate: feedbackEvalRuns.windowEndDate,
          windowDays: feedbackEvalRuns.windowDays,
          briefsDeliveredCount: feedbackEvalRuns.briefsDeliveredCount,
          keyboardTapsCount: feedbackEvalRuns.keyboardTapsCount,
          engagementRate: feedbackEvalRuns.engagementRate,
          positiveRate: feedbackEvalRuns.positiveRate,
          tuneCommandsCount: feedbackEvalRuns.tuneCommandsCount,
          distilledPrefsPresent: feedbackEvalRuns.distilledPrefsPresent,
          lastBriefAt: feedbackEvalRuns.lastBriefAt,
          lastTapAt: feedbackEvalRuns.lastTapAt,
          computedAt: feedbackEvalRuns.computedAt,
          isSmoke: isSmokeExpr,
        })
        .from(feedbackEvalRuns)
        .innerJoin(users, eq(users.id, feedbackEvalRuns.userId))
        .where(whereParts.length > 0 ? and(...whereParts) : undefined)
        .orderBy(...orderBy)
        .limit(limit);

      return { rows };
    }),

  /**
   * MUST-SHIP #12 — passive observability streak.
   *
   * Counts the number of consecutive `delivered` runs from newest backwards,
   * stopping at the first non-delivered row. `composing` / `pending` rows
   * still in flight are NOT counted as breaks (they haven't failed yet) so
   * a streak isn't visually reset by an in-flight cron. Anything else
   * (`failed`, `skipped_no_credits`, `no_telegram_link`, `no_spec`,
   * `composed_dry_run`) terminates the streak; the first of those
   * encountered is the "last break" reason surfaced to the admin.
   *
   * Cheap O(N) scan over the most recent rows. We cap at 1k rows so this
   * stays a single-page lookup even after months of cron firings — well
   * beyond any realistic streak. If a streak ever exceeds 1k briefs we
   * have bigger problems than truncating the counter.
   */
  qualityStreak: adminProcedure.query(async () => {
    const SCAN_LIMIT = 1000;
    const rows = await db
      .select({
        status: digestRuns.status,
        lastError: digestRuns.lastError,
        createdAt: digestRuns.createdAt,
      })
      .from(digestRuns)
      .orderBy(desc(digestRuns.createdAt))
      .limit(SCAN_LIMIT);

    const result = computeStreak(rows);
    const truncated = rows.length === SCAN_LIMIT && result.lastBreakAt === null;
    return {
      ...result,
      lastBreakError:
        result.lastBreakError && result.lastBreakError.length > LAST_ERROR_TRUNCATE
          ? result.lastBreakError.slice(0, LAST_ERROR_TRUNCATE) + "…"
          : result.lastBreakError,
      truncated,
    };
  }),

  /**
   * Evals Phase 0: single-run detail for /admin/runs/[id]. Returns the
   * composed markdown, sources bundle, and `metadata` (sourceResolve +
   * manualRating). Joined on users + digestSpecs the same way listRuns
   * does so the page header can render owner + spec version.
   */
  getRun: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: digestRuns.id,
          status: digestRuns.status,
          runDate: digestRuns.runDate,
          createdAt: digestRuns.createdAt,
          composedMarkdown: digestRuns.composedMarkdown,
          sourcesBundle: digestRuns.sourcesBundle,
          metadata: digestRuns.metadata,
          costUsd: digestRuns.costUsd,
          attemptCount: digestRuns.attemptCount,
          specVersion: digestSpecs.version,
          specIsSmoke: digestSpecs.isSmoke,
          userId: users.id,
          userEmail: users.email,
          userDeletedAt: users.deletedAt,
        })
        .from(digestRuns)
        .innerJoin(users, eq(users.id, digestRuns.userId))
        .innerJoin(digestSpecs, eq(digestSpecs.id, digestRuns.specId))
        .where(eq(digestRuns.id, input.runId))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Run ${input.runId} not found.`,
        });
      }
      return rows[0]!;
    }),

  /**
   * Evals Phase 0: write a manual rating into
   * `digest_runs.metadata.manualRating`. Overwrites any prior rating
   * (the client surfaces a "previously rated by …" banner before submit).
   *
   * We use jsonb_set so we don't clobber metadata.sourceResolve. ratedAt
   * + ratedBy are server-stamped so the client can't lie about provenance.
   */
  rateBrief: adminProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        grounding: z.number().int().min(1).max(5),
        specificity: z.number().int().min(1).max(5),
        fit: z.number().int().min(1).max(5),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rating = {
        grounding: input.grounding,
        specificity: input.specificity,
        fit: input.fit,
        notes: input.notes ?? null,
        ratedAt: new Date().toISOString(),
        ratedBy: ctx.user.email ?? "admin",
      };
      const ratingJson = JSON.stringify(rating);
      const updated = await db
        .update(digestRuns)
        .set({
          metadata: sql`jsonb_set(
            COALESCE(${digestRuns.metadata}, '{}'::jsonb),
            '{manualRating}',
            ${ratingJson}::jsonb,
            true
          )`,
          updatedAt: new Date(),
        })
        .where(eq(digestRuns.id, input.runId))
        .returning({ id: digestRuns.id });
      if (updated.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Run ${input.runId} not found.`,
        });
      }
      return { ok: true as const, rating };
    }),

  /**
   * CAD-* (paid GA prep): admin.listUsers — per-user cost & credit dashboard.
   *
   * Aggregates one row per user with lifetime cost-to-us (from transactions
   * with type='charge'), credits-in (topup/admin_grant/trial_grant/promo),
   * net debits (charge/refund), and digest-run delivery counts. Used by
   * /admin/users to surface heavy spenders + balance outliers.
   *
   * Raw SQL because we GROUP-by-with-FILTER pivots over transactions.type and
   * digest_runs.status — drizzle's query builder doesn't model FILTER cleanly
   * and the read pattern is bespoke enough that a hand-written CTE wins.
   *
   * Sort whitelist guards against arbitrary-column injection — sortBy is a
   * fixed enum that maps to a precomputed sql<>`` fragment.
   */
  listUsers: adminProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean().default(false),
          sortBy: z
            .enum(["cost", "balance", "created", "last_run"])
            .default("cost"),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const includeDeleted = input?.includeDeleted ?? false;
      const sortBy = input?.sortBy ?? "cost";
      const limit = input?.limit ?? 100;

      // Whitelist -> SQL ORDER BY fragment. Never interpolate raw input.
      const orderBy =
        sortBy === "balance"
          ? sql`u.credits_balance DESC`
          : sortBy === "created"
            ? sql`u.created_at DESC`
            : sortBy === "last_run"
              ? sql`MAX(dr.created_at) DESC NULLS LAST`
              : sql`(COALESCE(SUM(t.cost_to_us_micro_usd) FILTER (WHERE t.type = 'charge'), 0))::numeric DESC`;

      const whereDeleted = includeDeleted
        ? sql``
        : sql`WHERE u.deleted_at IS NULL`;

      const rows = await db.execute<{
        id: string;
        email: string;
        credits_balance: number;
        state: string;
        created_at: string;
        deleted_at: string | null;
        net_debits: string;
        total_credits_in: string;
        cost_to_us_usd: string;
        delivered_briefs: string;
        failed_briefs: string;
        last_run_at: string | null;
      }>(sql`
        SELECT
          u.id,
          u.email,
          u.credits_balance,
          u.state,
          to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          CASE WHEN u.deleted_at IS NULL THEN NULL
               ELSE to_char(u.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          END AS deleted_at,
          COALESCE(SUM(t.credits_delta) FILTER (WHERE t.type IN ('charge','refund')), 0)::text AS net_debits,
          COALESCE(SUM(t.credits_delta) FILTER (WHERE t.type IN ('topup','admin_grant','trial_grant','promo')), 0)::text AS total_credits_in,
          (COALESCE(SUM(t.cost_to_us_micro_usd) FILTER (WHERE t.type = 'charge'), 0)::numeric / 1000000)::text AS cost_to_us_usd,
          COUNT(DISTINCT dr.id) FILTER (WHERE dr.status = 'delivered')::text AS delivered_briefs,
          COUNT(DISTINCT dr.id) FILTER (WHERE dr.status = 'failed')::text AS failed_briefs,
          CASE WHEN MAX(dr.created_at) IS NULL THEN NULL
               ELSE to_char(MAX(dr.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          END AS last_run_at
        FROM public.users u
        LEFT JOIN public.transactions t ON t.user_id = u.id
        LEFT JOIN public.digest_runs dr ON dr.user_id = u.id
        ${whereDeleted}
        GROUP BY u.id, u.email, u.credits_balance, u.state, u.created_at, u.deleted_at
        ORDER BY ${orderBy}
        LIMIT ${limit}
      `);

      return {
        rows: rows.map((r) => ({
          id: r.id,
          email: r.email,
          creditsBalance: r.credits_balance,
          state: r.state,
          createdAt: r.created_at,
          deletedAt: r.deleted_at,
          netDebits: Number(r.net_debits),
          totalCreditsIn: Number(r.total_credits_in),
          costToUsUsd: Number(r.cost_to_us_usd),
          deliveredBriefs: Number(r.delivered_briefs),
          failedBriefs: Number(r.failed_briefs),
          lastRunAt: r.last_run_at,
        })),
        sortBy,
        includeDeleted,
      };
    }),

  /**
   * Phase B T4 — cron dispatcher trace.
   *
   * The cron-dispatch Inngest function emits a DispatcherSummary per
   * invocation but we don't persist it (no dispatcher_log table). For
   * the admin triage view we derive an equivalent by reading
   * digest_runs.created_at — every claimed minute landed a row in
   * digest_runs, so grouping by minute gives us:
   *   - minute               : truncated UTC minute
   *   - claimed              : rows created that minute
   *   - delivered / failed   : terminal status counts
   *   - pending              : still in flight
   *   - errors               : sample of last_error strings (failed only)
   *
   * "Collisions" and "scanned" aren't recoverable from digest_runs alone
   * (the unique-index swallows them). We surface a hint instead: if you
   * see two consecutive minutes with zero claimed but active briefs
   * exist, look at Inngest logs.
   *
   * Bounded to last 240 minutes (4h) max so the query stays cheap.
   */
  dispatchTrace: adminProcedure
    .input(
      z
        .object({
          lastNMinutes: z.number().int().min(1).max(240).default(60),
        })
        .default({}),
    )
    .query(async ({ input }) => {
      const sinceMs = Date.now() - input.lastNMinutes * 60_000;
      const since = new Date(sinceMs);

      type TraceRow = {
        minute: string;
        claimed: string;
        delivered: string;
        failed: string;
        pending: string;
        sample_error: string | null;
      };
      const rawRows = await db.execute(sql`
        SELECT
          to_char(date_trunc('minute', dr.created_at) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS minute,
          COUNT(*)::text AS claimed,
          COUNT(*) FILTER (WHERE dr.status IN ('delivered','sent'))::text AS delivered,
          COUNT(*) FILTER (WHERE dr.status = 'failed')::text AS failed,
          COUNT(*) FILTER (WHERE dr.status NOT IN ('delivered','sent','failed'))::text AS pending,
          (
            SELECT dr2.last_error
            FROM public.digest_runs dr2
            WHERE date_trunc('minute', dr2.created_at) = date_trunc('minute', dr.created_at)
              AND dr2.last_error IS NOT NULL
            LIMIT 1
          ) AS sample_error
        FROM public.digest_runs dr
        WHERE dr.created_at >= ${since}
        GROUP BY date_trunc('minute', dr.created_at)
        ORDER BY date_trunc('minute', dr.created_at) DESC
        LIMIT 240
      `);

      const rows = rawRows as unknown as TraceRow[];
      const minutes = rows.map((r) => ({
        minute: r.minute,
        claimed: Number(r.claimed),
        delivered: Number(r.delivered),
        failed: Number(r.failed),
        pending: Number(r.pending),
        sampleError: r.sample_error,
      }));

      const totals = minutes.reduce(
        (acc, m) => ({
          claimed: acc.claimed + m.claimed,
          delivered: acc.delivered + m.delivered,
          failed: acc.failed + m.failed,
          pending: acc.pending + m.pending,
        }),
        { claimed: 0, delivered: 0, failed: 0, pending: 0 },
      );

      return {
        windowMinutes: input.lastNMinutes,
        since: since.toISOString(),
        minutes,
        totals,
      };
    }),
});
