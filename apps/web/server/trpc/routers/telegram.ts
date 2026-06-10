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
      })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    const row = rows[0];
    return {
      linked: Boolean(row?.telegramChatId),
      username: row?.telegramUsername ?? null,
      botConfigured: isTelegramConfigured(),
    };
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
