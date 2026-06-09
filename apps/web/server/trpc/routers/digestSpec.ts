import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";
import { protectedProcedure, router } from "../trpc";
import { ruleFromLegacyCadence } from "@/lib/scheduling/rule";
import { nextRunAt as computeNextRunAt } from "@/lib/scheduling/evaluator";

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
 * digestSpec.* — read + write the user's current DigestSpec.
 *
 * Writes go through the Zod schema (server-side, no trust in client) and
 * versioning is monotonic per user: each save flips the previous current
 * row to is_current=false and inserts a new version.
 *
 * Service-role DB client is used here intentionally so we control the
 * trust boundary; we still scope every query by ctx.user.id.
 */
export const digestSpecRouter = router({
  /** Returns the user's current spec, or null if none yet. */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    // Wave 5 Bug 10: never surface an archived spec as "current". The /spec
    // and /briefs reads downstream rely on this returning null when the user
    // has only archived rows, so they can re-route into the create flow.
    const rows = await db
      .select()
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, ctx.user.id),
          eq(digestSpecs.isCurrent, true),
          ne(digestSpecs.status, "archived")
        )
      )
      .limit(1);
    return rows[0] ?? null;
  }),

  /** All versions for the user, newest first. */
  listVersions: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: digestSpecs.id,
        version: digestSpecs.version,
        isCurrent: digestSpecs.isCurrent,
        createdVia: digestSpecs.createdVia,
        createdAt: digestSpecs.createdAt,
      })
      .from(digestSpecs)
      .where(eq(digestSpecs.userId, ctx.user.id))
      .orderBy(desc(digestSpecs.version));
  }),

  /**
   * UX audit v2 P1 #2 — cross-link spec versions to the briefs they
   * generated. Returns up to 5 most-recent delivered briefs per spec id
   * (with shortId for the public permalink). The /spec UI groups these
   * under each version row so a user can jump from "v3 created via
   * chat_agent" to the actual brief that came out of it.
   */
  listVersionBriefs: protectedProcedure
    .input(z.object({ specIds: z.array(z.string().uuid()).max(20) }))
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
        .limit(100);
      // Filter to delivered/sent in JS so the index on (userId, createdAt)
      // is still hit cleanly. Cap at 5 per spec on the client side below.
      return rows.filter((r) => r.status === "delivered" || r.status === "sent");
    }),

  /**
   * Persist a new spec version. Used by:
   *  - the /spec raw JSON editor (createdVia="manual_edit")
   *  - the config-agent confirm_and_save tool (createdVia="chat_agent")
   */
  updateRaw: protectedProcedure
    .input(
      z.object({
        spec: digestSpecSchema,
        createdVia: z.enum(["manual_edit", "chat_agent"]).default("manual_edit"),
        // CAD-88: tier carries over to the new version. Default to
        // "default" so callers that don't pass this field don't
        // accidentally flip a Pro spec back to default; the spec-client
        // always passes the current tier explicitly.
        tier: z.enum(["default", "pro"]).default("default"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db.transaction(async (tx) => {
          // Flip current pointer + soft-archive the previous current row.
          // Wave 4 Bug 7/8: without the status flip, /briefs accumulates
          // every saved version as a duplicate "Untitled brief" card.
          await tx
            .update(digestSpecs)
            .set({ isCurrent: false, status: "archived", updatedAt: new Date() })
            .where(
              and(
                eq(digestSpecs.userId, ctx.user.id),
                eq(digestSpecs.isCurrent, true)
              )
            );

          // Find latest version number
          const latest = await tx
            .select({ version: digestSpecs.version })
            .from(digestSpecs)
            .where(eq(digestSpecs.userId, ctx.user.id))
            .orderBy(desc(digestSpecs.version))
            .limit(1);

          const nextVersion = (latest[0]?.version ?? 0) + 1;

          // Wave 4 Bug 7: derive name + scheduling + next_run_at so the
          // /briefs card surfaces real Schedule / Next delivery instead of
          // "Schedule not set" / "—".
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
          const next = computeNextRunAt(scheduling, new Date());
          const briefName = deriveBriefName(input.spec);

          const [inserted] = await tx
            .insert(digestSpecs)
            .values({
              userId: ctx.user.id,
              version: nextVersion,
              spec: input.spec,
              isCurrent: true,
              createdVia: input.createdVia,
              tier: input.tier,
              name: briefName,
              scheduling,
              status: "active",
              nextRunAt: next,
            })
            .returning();

          return inserted;
        });
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error ? err.message : "Failed to persist spec",
          cause: err,
        });
      }
    }),

  /**
   * CAD-88: flip the current spec's tier without bumping version.
   * Tier is a delivery-stack preference, not a spec-content change —
   * version bumps are reserved for prompt/content edits the composer
   * needs to react to. Always operates on the user's is_current row.
   *
   * If PRO_TIER_ALPHA is off at runtime, this still persists the user's
   * "pro" preference; the provider layer falls back to default at
   * compose time. We treat tier as preference + capability gate.
   */
  setTier: protectedProcedure
    .input(z.object({ tier: z.enum(["default", "pro"]) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await db
        .update(digestSpecs)
        .set({ tier: input.tier, updatedAt: new Date() })
        .where(
          and(
            eq(digestSpecs.userId, ctx.user.id),
            eq(digestSpecs.isCurrent, true)
          )
        )
        .returning({ id: digestSpecs.id, tier: digestSpecs.tier });
      if (updated.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No current spec to update.",
        });
      }
      return updated[0]!;
    }),
});
