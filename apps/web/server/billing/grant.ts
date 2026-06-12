/**
 * Settings-surfacing v1 (gap 10): admin credit grant through the ledger.
 *
 * Before this module, founder grants were raw SQL against a ledger with
 * invariants — the most likely self-inflicted billing incident. This is
 * the one sanctioned write path: same atomic UPDATE-then-INSERT
 * transaction shape as `debitForDelivery` (server/billing/debit.ts), so
 * `users.credits_balance` and the `transactions` ledger can never
 * disagree.
 *
 * Idempotency: the CLIENT generates a `grantId` (uuid) when it opens the
 * grant form. We check-before-insert INSIDE the same transaction for an
 * existing `admin_grant` row carrying that grantId in metadata — a
 * double-click, a retried request, or a flaky network can only ever
 * produce one ledger row and one balance bump.
 *
 * The `admin_grant` transaction type already exists in the ledger
 * vocabulary (lib/labels.ts renders it "Admin credit grant" on the user's
 * billing page — Money voice, no admin jargon leaks).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactions, users } from "@/server/db/schema";

export interface GrantResult {
  ok: true;
  /** True when this grantId was already applied — no new row written. */
  duplicate: boolean;
  balanceAfter: number;
}

export async function grantCredits(params: {
  userId: string;
  credits: number;
  /** Client-generated uuid; the idempotency key for this grant. */
  grantId: string;
  /** Admin email for the audit trail (metadata only, never user-shown). */
  grantedBy: string;
  note?: string;
}): Promise<GrantResult> {
  const { userId, credits, grantId, grantedBy, note } = params;
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error(`grantCredits: credits must be a positive integer, got ${credits}`);
  }

  return await db.transaction(async (tx) => {
    // Idempotency check-before-insert, inside the transaction.
    const existing = await tx
      .select({
        id: transactions.id,
        balanceAfter: transactions.balanceAfter,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "admin_grant"),
          sql`${transactions.metadata} ->> 'grantId' = ${grantId}`
        )
      )
      .limit(1);
    if (existing.length > 0) {
      return {
        ok: true as const,
        duplicate: true,
        balanceAfter: existing[0]!.balanceAfter,
      };
    }

    const updated = await tx
      .update(users)
      .set({
        creditsBalance: sql`${users.creditsBalance} + ${credits}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ balance: users.creditsBalance });
    const balanceAfter = updated[0]?.balance;
    if (balanceAfter == null) {
      throw new Error(`grantCredits: user ${userId} not found during UPDATE`);
    }

    await tx.insert(transactions).values({
      userId,
      type: "admin_grant",
      creditsDelta: credits,
      balanceAfter,
      metadata: {
        grantId,
        grantedBy,
        ...(note ? { note } : {}),
      },
    });

    return { ok: true as const, duplicate: false, balanceAfter };
  });
}
