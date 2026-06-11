/**
 * billing.* — read-only window onto the user's credit balance + ledger.
 *
 * Authoritative writes happen in `server/billing/{debit,refund,packs}.ts` and
 * (eventually) the Stripe webhook — this router only surfaces the current
 * balance for the dashboard and the last 50 transactions for the receipts
 * view. Both procedures are user-scoped via `protectedProcedure`.
 *
 * Extend here for new read shapes (cost-to-us summary, monthly rollup);
 * never put credit mutations in this file — debits/refunds must stay in
 * the dedicated billing modules so the invariants live in one place.
 *
 * CAD-215: `requestCredits` is the one mutation here, and it deliberately
 * does NOT touch the ledger — it's a founder notification (Telegram ping),
 * not a credit write. The invariant above is intact.
 */
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/server/db/client";
import { users, transactions } from "@/server/db/schema";
import { checkRateLimit } from "@/server/rate-limit/check";
import {
  formatPlainText,
  isTelegramConfigured,
  telegramAdapter,
  type TelegramTarget,
} from "@/server/channels/telegram";
import { log } from "@/lib/log";

/** Fixed window for credit-request pings: 1 per user per 24 hours. */
const CREDIT_REQUEST_WINDOW_SECONDS = 24 * 60 * 60;

export const billingRouter = router({
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({
        creditsBalance: users.creditsBalance,
        trialCreditsGrantedAt: users.trialCreditsGrantedAt,
      })
      .from(users)
      .where(eq(users.id, ctx.user!.id))
      .limit(1);
    return row ?? { creditsBalance: 0, trialCreditsGrantedAt: null };
  }),

  getLedger: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: transactions.id,
        type: transactions.type,
        creditsDelta: transactions.creditsDelta,
        balanceAfter: transactions.balanceAfter,
        createdAt: transactions.createdAt,
        metadata: transactions.metadata,
      })
      .from(transactions)
      .where(eq(transactions.userId, ctx.user!.id))
      .orderBy(desc(transactions.createdAt))
      .limit(50);
  }),

  /**
   * CAD-215 — "Request credits" founder ping from /settings/billing.
   *
   * Card payments aren't live yet, so granting credits is a manual founder
   * action. This sends one Telegram message to ADMIN_TELEGRAM_CHAT_ID via
   * the sanctioned channel adapter (never raw bot.api.sendMessage — ESLint
   * guard) so the founder can grant via /admin without watching an inbox.
   *
   * Rate limit: 1 request per user per 24h, reusing the `rate_limits`
   * fixed-window upsert (scope "credit_request") — no new table.
   *
   * Returns { sent: boolean }. sent=false (admin chat unset, Telegram not
   * configured, or send failure) is still a successful mutation — the UI
   * falls back to the support-email line. Never throw a user-facing error
   * because OUR ops channel is missing.
   */
  requestCredits: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user!.id;

    const rl = await checkRateLimit({
      userId,
      scope: "credit_request",
      limit: 1,
      windowSeconds: CREDIT_REQUEST_WINDOW_SECONDS,
    });
    if (!rl.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "We received your earlier request — we usually add credits within a day.",
      });
    }

    const [row] = await db
      .select({ creditsBalance: users.creditsBalance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const balance = row?.creditsBalance ?? 0;
    const email = ctx.user!.email ?? userId;

    const chatIdRaw = process.env.ADMIN_TELEGRAM_CHAT_ID ?? "";
    const chatId = Number(chatIdRaw);
    if (chatIdRaw.length === 0 || !Number.isFinite(chatId)) {
      log.warn(
        "billing.requestCredits: ADMIN_TELEGRAM_CHAT_ID unset or invalid — UI falls back to support email"
      );
      return { sent: false };
    }
    if (!isTelegramConfigured()) {
      log.warn(
        "billing.requestCredits: Telegram bot not configured — UI falls back to support email"
      );
      return { sent: false };
    }

    try {
      const target: TelegramTarget = { channel: "telegram", chatId };
      const parts = formatPlainText(
        `Credit request from ${email} — balance ${balance}. Grant via /admin.`
      );
      for (const part of parts) {
        await telegramAdapter.send(part, target);
      }
      return { sent: true };
    } catch (err) {
      // Don't surface our ops-channel hiccup as a user error; the UI shows
      // the support-email fallback. Sanitized string only — no raw error
      // object in logs (may carry chat ids).
      log.warn("billing.requestCredits: Telegram send failed", {
        err: String(err),
      });
      return { sent: false };
    }
  }),
});
