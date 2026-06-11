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
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs } from "@/server/db/schema";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { SHORT_ID_RE } from "@/server/digest/share";
import {
  ruleFromLegacyCadence,
  schedulingRuleV1,
  type SchedulingRuleV1,
} from "@/lib/scheduling/rule";
import { nextRunAt } from "@/lib/scheduling/evaluator";
import { creditCostForTier, type Tier } from "@/server/billing/cost";
import { maxBriefsForEmail } from "@/server/briefs/limit";
import { users } from "@/server/db/schema";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";

const DEFAULT_TZ = "Asia/Kuala_Lumpur";

function deriveBriefName(spec: DigestSpecV1): string {
  const t0 = spec.topics?.[0];
  if (typeof t0 === "string" && t0.trim().length > 0) {
    const trimmed = t0.trim();
    return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)} brief`;
  }
  return "Untitled brief";
}

/**
 * CAD-212: the brief cap moved to server/briefs/limit.ts (1 per user;
 * founder/admin 2) so the chat-save gate in save-spec.ts and this router
 * share one source of truth. Re-exported for existing import sites.
 */
export { MAX_BRIEFS_PER_USER } from "@/server/briefs/limit";

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

/**
 * Phase B T3 — Portfolio burn-rate math.
 *
 * Returns the expected briefs-per-day a single scheduling rule contributes.
 * Pure; tested via `briefsPerDayForRule.test.ts`.
 *
 *   - daily        : (weekdays.length / 7)        [default weekdays = 1..7 → 1.0]
 *   - weekly       : (weekdays.length / 7)
 *   - monthly      : 1 / 30                       [approx; we don't care about
 *                                                  the 28-vs-31 noise at this
 *                                                  granularity]
 *   - custom_cron  : 1 / 7                        [conservative; we don't parse
 *                                                  cron here. Pro-tier only,
 *                                                  rare.]
 *
 * `skipWhen.weekends` shaves weekend days off daily/weekly counts. `skipDates`
 * is ignored at this granularity — it's spot exclusions, not a rate.
 */
export function briefsPerDayForRule(rule: SchedulingRuleV1): number {
  const c = rule.cadence;
  const skipWeekends = rule.skipWhen?.weekends === true;
  if (c.kind === "daily" || c.kind === "weekly") {
    const wd = c.kind === "daily"
      ? (c.weekdays ?? [1, 2, 3, 4, 5, 6, 7])
      : c.weekdays;
    const filtered = skipWeekends ? wd.filter((d) => d <= 5) : wd;
    return filtered.length / 7;
  }
  if (c.kind === "monthly") {
    return 1 / 30;
  }
  // custom_cron — best-effort guess. Pro only.
  return 1 / 7;
}

export const briefsRouter = router({
  /**
   * Wave 4 Bug 6: derive the /app/link onboarding checklist from live
   * server state instead of in-memory component state. Without this, a
   * returning user (Telegram already linked, briefs already delivered)
   * who lands on /app/link sees a stale "step 2: Crafting your first
   * brief… (pending)" forever because the page initializes from
   * sampleStatus={kind: 'idle'}.
   *
   * Returns the three checklist booleans the page renders, plus the
   * next-delivery hint when fully onboarded.
   */
  onboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const [userRow, publishedRow, deliveredRow] = await Promise.all([
      db
        .select({
          telegramChatId: users.telegramChatId,
          timezone: users.timezone,
        })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1),
      db
        .select({ id: digestSpecs.id, nextRunAt: digestSpecs.nextRunAt, scheduling: digestSpecs.scheduling })
        .from(digestSpecs)
        .where(
          and(
            eq(digestSpecs.userId, ctx.user.id),
            inArray(digestSpecs.status, ["active", "paused"])
          )
        )
        .orderBy(desc(digestSpecs.updatedAt))
        .limit(1),
      db
        .select({ id: digestRuns.id })
        .from(digestRuns)
        .where(
          and(
            eq(digestRuns.userId, ctx.user.id),
            inArray(digestRuns.status, ["delivered", "sent"])
          )
        )
        .limit(1),
    ]);

    const telegramLinked = Boolean(userRow[0]?.telegramChatId);
    const briefCrafted = (publishedRow.length ?? 0) > 0;
    const briefDelivered = (deliveredRow.length ?? 0) > 0;
    const firstSpec = publishedRow[0] ?? null;
    const sched =
      firstSpec?.scheduling && typeof firstSpec.scheduling === "object"
        ? (firstSpec.scheduling as { timeLocal?: string; timezone?: string })
        : null;
    return {
      telegramLinked,
      briefCrafted,
      briefDelivered,
      nextRunAt: firstSpec?.nextRunAt
        ? firstSpec.nextRunAt instanceof Date
          ? firstSpec.nextRunAt.toISOString()
          : String(firstSpec.nextRunAt)
        : null,
      timeLocal: sched?.timeLocal ?? null,
      timezone: sched?.timezone ?? userRow[0]?.timezone ?? null,
    };
  }),

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
      // Wave 5 Bug 10: also flip is_current=false on archive. The legacy
      // single-brief code paths (digest cron in server/digest/run.ts, RSS
      // poller in server/connectors/rss.ts) still gate on is_current=true.
      // Without flipping it, archived rows stayed eligible for dispatch +
      // continued pulling RSS items — root cause of the 2026-06-09 17:03
      // stray sample brief.
      const updated = await db
        .update(digestSpecs)
        .set({
          status: "archived",
          archivedAt: sql`now()`,
          nextRunAt: null,
          isCurrent: false,
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
   * with the current count when the user has already hit their brief cap
   * (CAD-212: 1 per user, founder/admin 2 — see server/briefs/limit.ts).
   * The UI renders `max` as-is; it never hard-codes a limit.
   */
  canCreate: protectedProcedure.query(async ({ ctx }) => {
    const count = await countActiveOrPaused(ctx.user.id);
    const max = maxBriefsForEmail(ctx.user.email);
    return {
      allowed: count < max,
      count,
      max,
    };
  }),

  /**
   * Phase B T3 — Portfolio burn-rate summary for the /briefs header card.
   *
   * Aggregates briefs/day and credit cost/day across the user's ACTIVE
   * briefs only (paused briefs don't burn). Combines with the user's
   * current credit balance to render a runway figure in days.
   *
   * Returns:
   *   - activeCount         : number of active briefs
   *   - briefsPerDay        : expected briefs/day across the portfolio
   *   - creditsPerDay       : expected credit cost/day (tier-weighted)
   *   - creditsBalance      : current balance
   *   - runwayDays          : balance / creditsPerDay (null if creditsPerDay==0)
   *
   * Defensive: a corrupt scheduling jsonb that fails Zod is silently
   * skipped (counted in `skipped`) rather than 500'ing the whole card.
   */
  portfolioBurn: protectedProcedure.query(async ({ ctx }) => {
    const [activeSpecs, userRow] = await Promise.all([
      db
        .select({
          id: digestSpecs.id,
          scheduling: digestSpecs.scheduling,
          tier: digestSpecs.tier,
        })
        .from(digestSpecs)
        .where(
          and(
            eq(digestSpecs.userId, ctx.user.id),
            eq(digestSpecs.status, "active")
          )
        ),
      db
        .select({ creditsBalance: users.creditsBalance })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1),
    ]);

    let briefsPerDay = 0;
    let creditsPerDay = 0;
    let skipped = 0;
    for (const s of activeSpecs) {
      // Wave 4 Bug 7 fix: pre-multi-brief rows persisted with the schema
      // default ('{}' jsonb scheduling) aren't actually broken — they
      // predate Phase A. Skipping them silently keeps the burn-card
      // truthful without surfacing a stale "1 brief skipped (invalid
      // schedule)" warning to the user for every legacy row.
      if (
        !s.scheduling ||
        (typeof s.scheduling === "object" &&
          Object.keys(s.scheduling as Record<string, unknown>).length === 0)
      ) {
        continue;
      }
      const parsed = schedulingRuleV1.safeParse(s.scheduling);
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const rate = briefsPerDayForRule(parsed.data);
      briefsPerDay += rate;
      creditsPerDay += rate * creditCostForTier((s.tier ?? "default") as Tier);
    }

    const creditsBalance = userRow[0]?.creditsBalance ?? 0;
    const runwayDays =
      creditsPerDay > 0 ? creditsBalance / creditsPerDay : null;

    return {
      activeCount: activeSpecs.length,
      skipped,
      briefsPerDay,
      creditsPerDay,
      creditsBalance,
      runwayDays,
    };
  }),

  /**
   * Wave 6 / Bug 13: read one brief by id for the /briefs/[id] detail
   * page. Auth-scoped (userId) so a brief id from another user 404s.
   * Returns the full row including spec, scheduling, tier, status —
   * what the Overview + Advanced tabs render against.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(digestSpecs)
        .where(
          and(
            eq(digestSpecs.id, input.id),
            eq(digestSpecs.userId, ctx.user.id)
          )
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      return row;
    }),

  /**
   * Wave 6 / Bug 13: per-brief version history. Returns every digest_specs
   * row for this user that shares the brief's lineage. We don't yet model
   * lineage explicitly (no parent_id column), so today this returns the
   * user's full history newest-first — same as /spec used to show. The
   * input id is taken as a permission check; once a lineage column lands
   * we filter here without changing the call site.
   *
   * Paginated to keep large histories scannable in the Advanced tab.
   */
  listVersions: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const briefRows = await db
        .select({ id: digestSpecs.id })
        .from(digestSpecs)
        .where(
          and(
            eq(digestSpecs.id, input.id),
            eq(digestSpecs.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (briefRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      const all = await db
        .select({
          id: digestSpecs.id,
          version: digestSpecs.version,
          isCurrent: digestSpecs.isCurrent,
          status: digestSpecs.status,
          createdVia: digestSpecs.createdVia,
          createdAt: digestSpecs.createdAt,
        })
        .from(digestSpecs)
        .where(eq(digestSpecs.userId, ctx.user.id))
        .orderBy(desc(digestSpecs.version));
      const total = all.length;
      const items = all.slice(input.offset, input.offset + input.limit);
      return { items, total };
    }),

  /**
   * Wave 6 / Bug 13: per-brief raw spec edit. Edits THIS brief's spec
   * in place, bumps its version monotonically per user, re-derives name
   * + scheduling + next_run_at from the new spec. Does NOT touch other
   * briefs (legacy `digestSpec.updateRaw` archives every is_current=true
   * row, which is wrong for multi-brief — this procedure is the
   * brief-scoped replacement).
   */
  updateRaw: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        spec: digestSpecSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db.transaction(async (tx) => {
          const owned = await tx
            .select({ id: digestSpecs.id, status: digestSpecs.status })
            .from(digestSpecs)
            .where(
              and(
                eq(digestSpecs.id, input.id),
                eq(digestSpecs.userId, ctx.user.id)
              )
            )
            .limit(1);
          if (owned.length === 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Brief not found.",
            });
          }
          if (owned[0]!.status === "archived") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot edit an archived brief.",
            });
          }

          const latest = await tx
            .select({ version: digestSpecs.version })
            .from(digestSpecs)
            .where(eq(digestSpecs.userId, ctx.user.id))
            .orderBy(desc(digestSpecs.version))
            .limit(1);
          const nextVersion = (latest[0]?.version ?? 0) + 1;

          const userRow = await tx
            .select({ timezone: users.timezone })
            .from(users)
            .where(eq(users.id, ctx.user.id))
            .limit(1);
          const timezone = userRow[0]?.timezone ?? DEFAULT_TZ;
          const startDate = new Date().toISOString().slice(0, 10);
          const scheduling = ruleFromLegacyCadence({
            cadence: input.spec.cadence,
            timezone,
            startDate,
          });
          const next = nextRunAt(scheduling, new Date());
          const briefName = deriveBriefName(input.spec);

          const [updated] = await tx
            .update(digestSpecs)
            .set({
              version: nextVersion,
              spec: input.spec,
              createdVia: "manual_edit",
              name: briefName,
              scheduling,
              nextRunAt: next,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(digestSpecs.id, input.id),
                eq(digestSpecs.userId, ctx.user.id)
              )
            )
            .returning();
          return updated!;
        });
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to persist spec",
          cause: err,
        });
      }
    }),

  /**
   * Wave 6 / Bug 13: per-brief tier toggle. Mirrors digestSpec.setTier
   * but on a specific brief row (multi-brief). No version bump — tier is
   * a delivery-stack preference, not spec content.
   */
  setTier: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tier: z.enum(["default", "pro", "pro_websearch"]) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await db
        .update(digestSpecs)
        .set({ tier: input.tier, updatedAt: new Date() })
        .where(
          and(
            eq(digestSpecs.id, input.id),
            eq(digestSpecs.userId, ctx.user.id)
          )
        )
        .returning({ id: digestSpecs.id, tier: digestSpecs.tier });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Brief not found." });
      }
      return updated[0]!;
    }),

  /**
   * Wave 6 / Bug 13: same shape as digestSpec.listVersionBriefs but
   * scoped through a brief id. Used in the Advanced tab to cross-link
   * each version row to the briefs that came out of it.
   */
  listVersionBriefs: protectedProcedure
    .input(z.object({ specIds: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }) => {
      if (input.specIds.length === 0) return [];
      const rows = await db
        .select({
          id: digestRuns.id,
          specId: digestRuns.specId,
          shortId: digestRuns.shortId,
          runDate: digestRuns.runDate,
          createdAt: digestRuns.createdAt,
          status: digestRuns.status,
        })
        .from(digestRuns)
        .where(
          and(
            eq(digestRuns.userId, ctx.user.id),
            inArray(digestRuns.specId, input.specIds),
            isNotNull(digestRuns.shortId)
          )
        )
        .orderBy(desc(digestRuns.createdAt))
        .limit(200);
      return rows.filter(
        (r) => r.status === "delivered" || r.status === "sent"
      );
    }),
});
