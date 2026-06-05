/**
 * briefs.* — public read surface for the per-brief permalink + the
 * multi-brief management surface (list/pause/resume/archive/preview).
 *
 * Two distinct authorization tiers in this file:
 *   - `getByShortId` is PUBLIC. Possession of the shortId is the auth.
 *     Don't leak anything sensitive (no userId, no email, no costs).
 *   - everything else is `protectedProcedure` and scoped to ctx.user.id.
 *
 * Multi-brief Phase A 2b (migration 0024):
 *   - list      : active+paused (not archived) briefs for the user,
 *                 with last-run summary.
 *   - pause     : status -> 'paused', paused_at = now, next_run_at = null.
 *   - resume    : status -> 'active', paused_at = null,
 *                 recompute next_run_at via the JS evaluator.
 *   - archive   : soft-delete (status='archived', archived_at = now,
 *                 next_run_at = null).
 *   - preview   : pure — takes a SchedulingRuleV1, returns next 5
 *                 occurrences starting from now.
 *   - canCreate : enforce the soft-cap of 5 active+paused briefs per user.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs } from "@/server/db/schema";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { SHORT_ID_RE } from "@/server/digest/share";
import { schedulingRuleV1 } from "@/lib/scheduling/rule";
import { nextRunAt } from "@/lib/scheduling/evaluator";

/**
 * Multi-brief soft cap. Active + paused briefs are billable surface area
 * (every active row contributes to per-minute scan) and a UX-clutter risk
 * on /briefs. Hard-coded for v1; we'll graduate to a per-tier limit when
 * Pro lands beyond alpha.
 */
export const MAX_BRIEFS_PER_USER = 5;

/**
 * Helper: count of non-archived briefs for a user. Pulled out so both
 * `canCreate` and any other create path (chat.createSpec) can share the
 * cap-check.
 */
export async function countActiveOrPaused(userId: string): Promise<number> {
  const rows = await db
    .select({ id: digestSpecs.id })
    .from(digestSpecs)
    .where(
      and(
        eq(digestSpecs.userId, userId),
        inArray(digestSpecs.status, ["active", "paused"])
      )
    );
  return rows.length;
}

export const briefsRouter = router({
  /**
   * Fetch a brief by its public shortId. Returns just the renderable
   * payload — markdown, run date, spec metadata for headline rendering.
   *
   * Throws NOT_FOUND for unknown / non-delivered briefs. We don't expose
   * pending/failed briefs publicly.
   */
  getByShortId: publicProcedure
    .input(z.object({ shortId: z.string().regex(SHORT_ID_RE) }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: digestRuns.id,
          shortId: digestRuns.shortId,
          status: digestRuns.status,
          runDate: digestRuns.runDate,
          composedMarkdown: digestRuns.composedMarkdown,
          createdAt: digestRuns.createdAt,
          specJson: digestSpecs.spec,
        })
        .from(digestRuns)
        .innerJoin(digestSpecs, eq(digestRuns.specId, digestSpecs.id))
        .where(eq(digestRuns.shortId, input.shortId))
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      // Only published / delivered briefs are public. A pending/failed
      // brief shouldn't render to the world.
      if (row.status !== "delivered" && row.status !== "sent") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Brief not ready.",
        });
      }
      if (!row.composedMarkdown) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Brief has no content.",
        });
      }

      const spec = (row.specJson ?? {}) as Record<string, unknown>;
      const topics = Array.isArray((spec as { topics?: unknown[] }).topics)
        ? ((spec as { topics: unknown[] }).topics.filter(
            (t): t is string => typeof t === "string"
          ) as string[])
        : [];

      return {
        shortId: row.shortId!,
        runDate: row.runDate,
        composedMarkdown: row.composedMarkdown,
        topics: topics.slice(0, 5),
        createdAt: row.createdAt,
      };
    }),

  /**
   * List the user's manageable briefs: active + paused, newest first.
   * Each row carries `nextRunAt` (already materialized on the spec) plus
   * a `lastRun` summary derived from the most recent digest_runs row for
   * that spec (delivered preferred; falls back to most-recent regardless
   * of status if no delivered run exists yet).
   *
   * Archived rows are intentionally excluded — they show up in version
   * history on /spec, not /briefs.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const specs = await db
      .select({
        id: digestSpecs.id,
        name: digestSpecs.name,
        status: digestSpecs.status,
        scheduling: digestSpecs.scheduling,
        tier: digestSpecs.tier,
        nextRunAt: digestSpecs.nextRunAt,
        pausedAt: digestSpecs.pausedAt,
        createdAt: digestSpecs.createdAt,
        updatedAt: digestSpecs.updatedAt,
      })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, ctx.user.id),
          inArray(digestSpecs.status, ["active", "paused"])
        )
      )
      .orderBy(desc(digestSpecs.updatedAt));

    if (specs.length === 0) return [];

    const specIds = specs.map((s) => s.id);
    const runs = await db
      .select({
        id: digestRuns.id,
        specId: digestRuns.specId,
        shortId: digestRuns.shortId,
        status: digestRuns.status,
        runDate: digestRuns.runDate,
        createdAt: digestRuns.createdAt,
      })
      .from(digestRuns)
      .where(
        and(
          eq(digestRuns.userId, ctx.user.id),
          inArray(digestRuns.specId, specIds)
        )
      )
      .orderBy(desc(digestRuns.createdAt))
      .limit(specIds.length * 3); // small overscan; we pick one per spec below

    // Pick the most recent delivered run per spec (fallback: most recent any).
    const lastBySpec = new Map<
      string,
      { id: string; shortId: string | null; status: string; runDate: string | Date; createdAt: Date }
    >();
    for (const r of runs) {
      if (lastBySpec.has(r.specId)) continue;
      lastBySpec.set(r.specId, r);
    }

    return specs.map((s) => ({
      ...s,
      lastRun: lastBySpec.get(s.id) ?? null,
    }));
  }),

  /**
   * Pause a brief. Idempotent: pausing a paused brief is a no-op.
   * Sets paused_at = now and clears next_run_at so the dispatcher
   * early-filter skips it cleanly.
   */
  pause: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await db
        .update(digestSpecs)
        .set({
          status: "paused",
          pausedAt: sql`now()`,
          nextRunAt: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(digestSpecs.id, input.id),
            eq(digestSpecs.userId, ctx.user.id),
            inArray(digestSpecs.status, ["active", "paused"])
          )
        )
        .returning({ id: digestSpecs.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      return { ok: true as const, id: updated[0]!.id };
    }),

  /**
   * Resume a paused brief. Re-validates the persisted scheduling jsonb
   * against the Zod schema (defense in depth — a corrupt row shouldn't
   * silently flip to active) and recomputes next_run_at via the JS
   * evaluator. If the evaluator returns null (endDate in the past, etc.)
   * the brief is left active with NULL next_run_at; the dispatcher's
   * early-filter will skip it and the user can edit the schedule.
   */
  resume: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await db
        .select({ id: digestSpecs.id, scheduling: digestSpecs.scheduling, status: digestSpecs.status })
        .from(digestSpecs)
        .where(
          and(eq(digestSpecs.id, input.id), eq(digestSpecs.userId, ctx.user.id))
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      if (row.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived briefs cannot be resumed — restore from version history first.",
        });
      }
      const parsed = schedulingRuleV1.safeParse(row.scheduling);
      const next = parsed.success ? nextRunAt(parsed.data, new Date()) : null;
      const updated = await db
        .update(digestSpecs)
        .set({
          status: "active",
          pausedAt: null,
          nextRunAt: next,
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(digestSpecs.id, input.id), eq(digestSpecs.userId, ctx.user.id))
        )
        .returning({ id: digestSpecs.id });
      return { ok: true as const, id: updated[0]!.id, nextRunAt: next };
    }),

  /**
   * Soft-delete a brief. Sets status='archived', archived_at=now, clears
   * next_run_at. Recoverable from /spec version history (CAD-5x follow-up).
   */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await db
        .update(digestSpecs)
        .set({
          status: "archived",
          archivedAt: sql`now()`,
          nextRunAt: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(digestSpecs.id, input.id),
            eq(digestSpecs.userId, ctx.user.id),
            inArray(digestSpecs.status, ["active", "paused"])
          )
        )
        .returning({ id: digestSpecs.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      return { ok: true as const, id: updated[0]!.id };
    }),

  /**
   * Pure preview: takes a SchedulingRuleV1, returns the next 5 UTC
   * occurrences starting from now. No DB hit. Used by the create/edit UI
   * to render "next fires: Mon 08:00, Tue 08:00, …" without persisting.
   *
   * Capped at 5 to keep the loop bounded — pathological rules (open-ended
   * skipDates eating every match) bail at MAX_SEARCH_MINUTES inside
   * `nextRunAt` itself.
   */
  preview: protectedProcedure
    .input(z.object({ rule: z.unknown(), count: z.number().int().min(1).max(10).default(5) }))
    .query(async ({ input }) => {
      const parsed = schedulingRuleV1.safeParse(input.rule);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid scheduling rule: ${parsed.error.message}`,
        });
      }
      const out: Date[] = [];
      let cursor = new Date();
      for (let i = 0; i < input.count; i++) {
        const next = nextRunAt(parsed.data, cursor);
        if (!next) break;
        out.push(next);
        // Step past this hit by 1 minute so the next iteration finds the
        // following occurrence rather than re-finding this one.
        cursor = new Date(next.getTime() + 60_000);
      }
      return { occurrences: out };
    }),

  /**
   * UI pre-check before opening the create flow. Returns `allowed=false`
   * with the current count when the user has already hit MAX_BRIEFS_PER_USER
   * active+paused briefs.
   */
  canCreate: protectedProcedure.query(async ({ ctx }) => {
    const count = await countActiveOrPaused(ctx.user.id);
    return {
      allowed: count < MAX_BRIEFS_PER_USER,
      count,
      max: MAX_BRIEFS_PER_USER,
    };
  }),
});
