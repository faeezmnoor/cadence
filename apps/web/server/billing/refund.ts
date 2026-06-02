/**
 * PM-audit #2: refund-by-credit for a failed digest_runs row.
 *
 * Invariants:
 *   - Only refunds a run whose status != 'delivered' (we don't refund
 *     successful deliveries — those are the user's value).
 *   - Idempotent per digest_run_id: re-running on the same row is a no-op
 *     and returns `{ refunded: false, reason: 'already_refunded' }`. We
 *     enforce by checking for an existing transactions row with
 *     type='refund' and digest_run_id=<row>.
 *   - The successful-delivery debit (debit.ts) only fires on `delivered`,
 *     so a failed run never had a charge to begin with. We still credit
 *     +1 because the user was either:
 *       (a) charged at a previous flawed code-path (pre-this-PR builds),
 *       (b) entitled to good-faith make-good per Terms ("If we miss a
 *           delivery because of an outage on our side, the credit is
 *           returned.")
 *
 * Transaction:
 *     UPDATE users SET credits_balance = credits_balance + 1 RETURNING ...
 *     INSERT INTO transactions (..., type='refund', credits_delta=+1, ...)
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, transactions, users } from "@/server/db/schema";

export interface RefundResult {
  refunded: boolean;
  balanceAfter?: number;
  transactionId?: string;
  reason?: "already_refunded" | "run_delivered" | "run_not_found";
}

export async function refundForFailedRun(params: {
  digestRunId: string;
  /** Admin email or system tag; stored in transactions.metadata. */
  refundedBy: string;
  /** Optional human-readable reason; surfaces in the apology email. */
  reason?: string;
}): Promise<RefundResult> {
  const { digestRunId, refundedBy, reason } = params;

  // Load + validate the run
  const runRows = await db
    .select({
      id: digestRuns.id,
      userId: digestRuns.userId,
      status: digestRuns.status,
    })
    .from(digestRuns)
    .where(eq(digestRuns.id, digestRunId))
    .limit(1);
  const run = runRows[0];
  if (!run) return { refunded: false, reason: "run_not_found" };
  if (run.status === "delivered") {
    return { refunded: false, reason: "run_delivered" };
  }

  // Idempotency: existing refund row on this run?
  const existing = await db
    .select({ id: transactions.id, balanceAfter: transactions.balanceAfter })
    .from(transactions)
    .where(
      and(
        eq(transactions.digestRunId, digestRunId),
        eq(transactions.type, "refund")
      )
    )
    .limit(1);
  if (existing.length > 0) {
    return {
      refunded: false,
      reason: "already_refunded",
      balanceAfter: existing[0]!.balanceAfter,
      transactionId: existing[0]!.id,
    };
  }

  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({
        creditsBalance: sql`${users.creditsBalance} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, run.userId))
      .returning({ balance: users.creditsBalance });
    const balanceAfter = updated[0]?.balance;
    if (balanceAfter == null) {
      throw new Error(`refundForFailedRun: user ${run.userId} not found`);
    }

    const inserted = await tx
      .insert(transactions)
      .values({
        userId: run.userId,
        type: "refund",
        creditsDelta: 1,
        balanceAfter,
        digestRunId,
        metadata: {
          refundedBy,
          reason: reason ?? null,
          runStatus: run.status,
        },
      })
      .returning({ id: transactions.id });

    return {
      refunded: true,
      balanceAfter,
      transactionId: inserted[0]!.id,
    };
  });
}
