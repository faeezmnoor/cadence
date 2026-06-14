/**
 * telegram.* — link-status read + link-token issuance.
 *
 * The actual /start <token> handling lives in the Telegram webhook
 * (apps/web/app/api/telegram/webhook/route.ts) which calls
 * resolveAndLinkToken directly. We never expose that to clients.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { buildStartDeepLink, isTelegramConfigured } from "@/server/channels/telegram/client";
import { issueLinkToken } from "@/server/channels/telegram/inbound/link-token";
import { protectedProcedure, router } from "../trpc";

export const telegramRouter = router({
  /** Returns the user's current Telegram link status. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        telegramChatId: users.telegramChatId,
        telegramUsername: users.telegramUsername,
        state: users.state,
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    const row = rows[0];
    return {
      linked: Boolean(row?.telegramChatId),
      username: row?.telegramUsername ?? null,
      /** users.state — "delivery_broken" drives the broken-delivery card. */
      state: row?.state ?? "active",
      botConfigured: isTelegramConfigured(),
    };
  }),

  /**
   * Settings-surfacing v1 (gap 3): disconnect Telegram. Clears the
   * linkage only — briefs keep their status and schedule, learning and
   * credits are untouched. While unlinked, both the cron dispatcher and
   * the pipeline skip the user's runs WITHOUT debiting or writing failed
   * rows (see cron-dispatch.ts + digest/run.ts "skipped_unlinked"), and
   * `next_run_at` keeps advancing so delivery resumes at the next
   * scheduled occurrence after relink — no back-fill flood.
   *
   * Relink reuses the existing 15-min token flow unchanged; linking a
   * different Telegram account simply replaces the cleared columns.
   */
  unlink: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(users)
      .set({
        telegramChatId: null,
        telegramUsername: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));
    return { ok: true as const };
  }),

  /**
   * Issue a fresh single-use link token and return the BotFather deep link
   * the UI should send the user to.
   */
  createLinkToken: protectedProcedure.mutation(async ({ ctx }) => {
    const { token, expiresAt } = await issueLinkToken(ctx.user.id);
    return {
      token,
      expiresAt,
      deepLink: buildStartDeepLink(token),
      botConfigured: isTelegramConfigured(),
    };
  }),
});
