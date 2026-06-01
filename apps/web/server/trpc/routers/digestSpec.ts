import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { digestSpecs } from "@/server/db/schema";
import { digestSpecSchema } from "@/lib/digest-spec/schema";
import { protectedProcedure, router } from "../trpc";

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
    const rows = await db
      .select()
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, ctx.user.id),
          eq(digestSpecs.isCurrent, true)
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
   * Persist a new spec version. Used by:
   *  - the /spec raw JSON editor (createdVia="manual_edit")
   *  - the config-agent confirm_and_save tool (createdVia="chat_agent")
   */
  updateRaw: protectedProcedure
    .input(
      z.object({
        spec: digestSpecSchema,
        createdVia: z.enum(["manual_edit", "chat_agent"]).default("manual_edit"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db.transaction(async (tx) => {
          // Flip current pointer
          await tx
            .update(digestSpecs)
            .set({ isCurrent: false, updatedAt: new Date() })
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

          const [inserted] = await tx
            .insert(digestSpecs)
            .values({
              userId: ctx.user.id,
              version: nextVersion,
              spec: input.spec,
              isCurrent: true,
              createdVia: input.createdVia,
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
});
