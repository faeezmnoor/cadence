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
