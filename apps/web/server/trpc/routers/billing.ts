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
 */
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/server/db/client";
import { users, transactions } from "@/server/db/schema";

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
});
