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
import { and, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db/client";
import { digestRuns } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";
import { runDigestPipeline } from "@/server/digest/run";

/**
 * Cool-down window for digest.sampleNow. Migration 0004 dropped the
 * (user_id, run_date) UNIQUE that previously folded back-to-back clicks; we
 * replace that protection with a short application-level guard so two
 * "Sample Now" clicks 200 ms apart don't trigger two parallel
 * Anthropic + Telegram round-trips.
 */
const SAMPLE_NOW_COOLDOWN_MS = 30_000;

export const digestRouter = router({
  /** Compose now. Sends to Telegram unless dryRun is true. */
  sampleNow: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }).optional())
    .mutation(async ({ ctx, input }) => {
      const dryRun = input?.dryRun ?? false;

      // Dedup guard (replaces the dropped user_run_date_uq, per T-303 bonus).
      // Skip the cool-down for dry-runs — previewing twice is cheap and
      // doesn't hit Telegram.
      if (!dryRun) {
        const since = new Date(Date.now() - SAMPLE_NOW_COOLDOWN_MS);
        const recent = await db
          .select({ id: digestRuns.id, status: digestRuns.status })
          .from(digestRuns)
          .where(
            and(
              eq(digestRuns.userId, ctx.user.id),
              gte(digestRuns.createdAt, since)
            )
          )
          .limit(1);
        if (recent.length > 0) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "You just generated a brief — give it a moment before trying again.",
          });
        }
      }

      return runDigestPipeline({
        userId: ctx.user.id,
        dryRun,
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
