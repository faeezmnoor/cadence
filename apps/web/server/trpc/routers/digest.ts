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
import { and, desc, eq, gte, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db/client";
import { digestRuns } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";
import { runDigestPipeline } from "@/server/digest/run";

/**
 * Cool-down window for digest.sampleNow.
 *
 * PM-audit #9: bumped from 30s to 5min so the "Send sample now" button on
 * /app/link and /settings/account can't be used to mass-burn credits in a
 * tight loop. 5 minutes is the smallest window that still feels generous
 * for "I didn't see it, send again" while gating the LLM cost ceiling at
 * one paid compose per 5 minutes per user.
 *
 * Migration 0004 dropped the (user_id, run_date) UNIQUE that previously
 * folded back-to-back clicks; this is the application-level replacement.
 */
const SAMPLE_NOW_COOLDOWN_MS = 5 * 60_000;

export const digestRouter = router({
  /** Compose now. Sends to Telegram unless dryRun is true. */
  sampleNow: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }).optional())
    .mutation(async ({ ctx, input }) => {
      const dryRun = input?.dryRun ?? false;

      // Dedup guard (replaces the dropped user_run_date_uq, per T-303 bonus).
      // Skip the cool-down for dry-runs — previewing twice is cheap and
      // doesn't hit Telegram.
      //
      // QA P1 #5: the cooldown query previously counted EVERY digest_runs
      // row in the window, including status='failed'. A failed compose
      // (no Telegram link, model error, source bundle empty) would lock
      // the user out for 5 minutes even though no brief actually went out.
      // Dry-runs already short-circuit before the persist block in
      // server/digest/run.ts so they don't land in digest_runs at all —
      // we only need to exclude 'failed' here. Status values that should
      // count as a real send: 'composing' (in-flight) and 'delivered'.
      if (!dryRun) {
        const since = new Date(Date.now() - SAMPLE_NOW_COOLDOWN_MS);
        const recent = await db
          .select({ id: digestRuns.id, status: digestRuns.status })
          .from(digestRuns)
          .where(
            and(
              eq(digestRuns.userId, ctx.user.id),
              gte(digestRuns.createdAt, since),
              ne(digestRuns.status, "failed")
            )
          )
          .limit(1);
        if (recent.length > 0) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "You just sent a brief. Try again in a few minutes.",
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
