/**
 * learning.* — read-only surface for the "What I've learned about you" page.
 *
 * Stream E #4 (PM audit G3). The self-learning claim is the marketing
 * promise; if a user can't see what Cadence has learned, they don't trust
 * the claim. This router exposes the same data the composer reads:
 *
 *   - getDistilled: the user's distilled_prefs (consumed LearningLog rows
 *     rolled up by the weekly distill job into stable bullets).
 *   - getRecentTunes: the last 5 raw inputs (tune_command, feedback_event,
 *     freeform) regardless of whether they've been distilled yet — so the
 *     user can see "I told it this last night and the distill job hasn't
 *     run yet" instead of getting confused by silent latency.
 */
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users, learningLog } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";

export const learningRouter = router({
  /**
   * Returns the distilled preference bullets the composer reads each run.
   * Shape is whatever the distill job writes — typically a string[] of
   * short bullets, but kept as `unknown` here so the FE renders defensively.
   */
  getDistilled: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({ distilledPrefs: users.distilledPrefs })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    const raw = row?.distilledPrefs;
    // Coerce a few likely shapes into a string[]. If null/empty, return [].
    if (!raw) return { bullets: [] as string[] };

    if (Array.isArray(raw)) {
      return {
        bullets: raw.filter((x): x is string => typeof x === "string"),
      };
    }
    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.bullets)) {
        return {
          bullets: obj.bullets.filter(
            (x): x is string => typeof x === "string"
          ),
        };
      }
      if (Array.isArray(obj.preferences)) {
        return {
          bullets: obj.preferences.filter(
            (x): x is string => typeof x === "string"
          ),
        };
      }
    }
    if (typeof raw === "string") return { bullets: [raw] };
    return { bullets: [] as string[] };
  }),

  /**
   * Last N raw learning_log rows for the user. Includes both distilled and
   * pending entries — the FE distinguishes via `distilledAt`.
   */
  getRecentTunes: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 5;
      const rows = await db
        .select({
          id: learningLog.id,
          source: learningLog.source,
          rawText: learningLog.rawText,
          distilledAt: learningLog.distilledAt,
          consumedAt: learningLog.consumedAt,
          createdAt: learningLog.createdAt,
        })
        .from(learningLog)
        .where(eq(learningLog.userId, ctx.user.id))
        .orderBy(desc(learningLog.createdAt))
        .limit(limit);
      return rows;
    }),
});
