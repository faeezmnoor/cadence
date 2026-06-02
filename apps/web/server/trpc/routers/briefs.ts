/**
 * briefs.* — public read surface for the per-brief permalink.
 *
 * Stream E #6 (PM audit G6). One brief = one shareable URL =
 * cadence.app/b/<short_id>. Public on purpose; briefs are post-send
 * artifacts a user might forward, and stripping share friction is the
 * single biggest word-of-mouth lever in the product.
 *
 * Authorization: NONE — possession of the shortId is the auth. Don't
 * leak anything sensitive here (no userId, no email, no costs).
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs } from "@/server/db/schema";
import { publicProcedure, router } from "../trpc";
import { SHORT_ID_RE } from "@/server/digest/share";

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

      // Pull a couple of safe display fields from the spec.
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
});
