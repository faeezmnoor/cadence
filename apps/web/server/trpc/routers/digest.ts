/**
 * digest.* — manual + diagnostic routes around the digest pipeline.
 *
 * T-210: `digest.sampleNow` — authed user requests a one-shot digest.
 *   - dryRun=true  => compose only, no Telegram send, return markdown
 *   - dryRun=false => compose + send to linked Telegram chat (if any)
 *
 * Manage-mode wave (plan §4.5): the guard logic (expectedSpecId/is_current
 * assertion, 5-minute delivery cooldown) moved verbatim into the shared
 * core `server/digest/sample.ts`, which the chat agent's `send_sample`
 * tool also calls. This router is a thin wrapper that maps the core's
 * typed failures back to the EXACT TRPCError codes/messages the
 * brief-actions client depends on (locked by router tests). The trpc
 * origin is exempt from the chat-only 60s dry-run throttle.
 *
 * Listing past runs is also exposed for the /app history view.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db/client";
import { digestRuns } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";
import { runSampleForUser, sampleBlockedReason } from "@/server/digest/sample";
import { log } from "@/lib/log";

export const digestRouter = router({
  /** Compose now. Sends to Telegram unless dryRun is true. */
  sampleNow: protectedProcedure
    .input(
      z
        .object({
          dryRun: z.boolean().default(false),
          /**
           * Dogfood-bugs 2026-06-09 fix: spec-id the client believes is
           * about to be composed against. When set, the server compares
           * to the user's actual `is_current` digest_spec; a mismatch
           * means the client is firing on a stale spec (e.g. user
           * configured a new brief in chat but didn't confirm_and_save
           * before clicking "Send me one now") and we refuse rather
           * than send the wrong content. Optional so the Telegram /sample
           * command + admin replay paths (which have no client-side spec
           * id to assert against) keep working unchanged.
           */
          expectedSpecId: z.string().uuid().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const dryRun = input?.dryRun ?? false;
      // ACX.5 analytics (exec PR review round 1, CPO#1): the panel path
      // logs the SAME event/field shape as the chat tool (send_sample.ts,
      // via:'chat_tool') so the sample funnel covers both surfaces. No
      // thread on this surface; specId is the client-asserted
      // expectedSpecId when present.
      log.info("sample_requested", {
        userId: ctx.user.id,
        specId: input?.expectedSpecId ?? null,
        via: "panel_button",
        dry_run: dryRun,
      });

      const result = await runSampleForUser({
        userId: ctx.user.id,
        dryRun,
        origin: "trpc",
        expectedSpecId: input?.expectedSpecId,
      });

      if (!result.ok) {
        // ACX.5: shared reason vocabulary — sampleBlockedReason keeps the
        // panel and chat-tool reasons from forking.
        log.info("sample_blocked", {
          userId: ctx.user.id,
          specId: input?.expectedSpecId ?? null,
          via: "panel_button",
          dry_run: dryRun,
          reason: sampleBlockedReason(
            result.code,
            "scope" in result ? result.scope : undefined
          ),
        });
        // EXACT legacy codes/messages — brief-actions error handling
        // string-matches these (see components/chat/brief-actions.tsx).
        if (result.code === "stale_spec") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Your spec hasn't been saved yet. Confirm it in chat first, then try again.",
          });
        }
        if (result.code === "cooldown") {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "You just sent a brief. Try again in a few minutes.",
          });
        }
        if (!("run" in result)) {
          // spec_not_found/archived only fire on the specId (chat tool)
          // path; the trpc path never passes specId. Defensive.
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        }
        return result.run;
      }

      // Pipeline outcomes (delivered, composed_dry_run, no_telegram_link,
      // skipped_no_credits, no_spec, duplicate, failed) pass through as the
      // raw RunDigestResult exactly as before the extraction — the client
      // branches on run.status.
      return result.run;
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
