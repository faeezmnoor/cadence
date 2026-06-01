/**
 * digest.* — manual + diagnostic routes around the digest pipeline.
 *
 * T-210: `digest.sampleNow` — authed user requests a one-shot digest.
 *   - dryRun=true  => compose only, no Telegram send, return markdown
 *   - dryRun=false => compose + send to linked Telegram chat (if any)
 *   - Always writes a digest_runs row for auditability + cost tracking
 *
 * Listing past runs is also exposed for the /app history view.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";
import { runDigestPipeline } from "@/server/digest/run";

export const digestRouter = router({
  /** Compose now. Sends to Telegram unless dryRun is true. */
  sampleNow: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }).optional())
    .mutation(async ({ ctx, input }) => {
      const dryRun = input?.dryRun ?? false;
      return runDigestPipeline({
        userId: ctx.user.id,
        dryRun,
        // Sample requests use today's date — duplicates get folded by the
        // (user_id, run_date) unique index, which is the desired UX:
        // "you already got today's brief; check Telegram."
      });
    }),

  /** Recent runs for the authed user, newest first. */
  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      return db
        .select({
          id: digestRuns.id,
          runDate: digestRuns.runDate,
          status: digestRuns.status,
          telegramMessageId: digestRuns.telegramMessageId,
          costUsd: digestRuns.costUsd,
          createdAt: digestRuns.createdAt,
        })
        .from(digestRuns)
        .where(eq(digestRuns.userId, ctx.user.id))
        .orderBy(desc(digestRuns.createdAt))
        .limit(limit);
    }),

  /** Fetch one composed brief by id — used by the in-app preview. */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(digestRuns)
        .where(and(eq(digestRuns.id, input.id), eq(digestRuns.userId, ctx.user.id)))
        .limit(1);
      return rows[0] ?? null;
    }),
});
