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
 * grant form. Two layers (review CTO P2-2):
 *   1. Fast path: check-before-insert INSIDE the transaction for an
 *      existing `admin_grant` row carrying that grantId — catches the
 *      sequential double-click / retried request cheaply.
 *   2. Guarantee: the partial unique index from migration 0028
 *      (transactions ((metadata->>'grantId')) WHERE type='admin_grant')
 *      arbitrates CONCURRENT submissions — two READ COMMITTED
 *      transactions can both pass the SELECT, but only one INSERT wins.
 *      The loser's onConflictDoNothing returns no row; we abort its
 *      transaction (rolling back the balance bump) and report
 *      duplicate=true with the winner's balance.
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

/**
 * CTO P2-2: internal sentinel — thrown inside the transaction when the
 * ledger INSERT loses the unique-index race, so Drizzle rolls back the
 * balance UPDATE. Caught (only) by grantCredits below.
 */
class DuplicateGrantConflict extends Error {
  constructor() {
    super("grantCredits: concurrent duplicate grantId");
  }
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

  try {
    return await db.transaction(async (tx) => {
      // Idempotency fast path: check-before-insert, inside the transaction.
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

      // CTO P2-2: the partial unique index (migration 0028) arbitrates
      // concurrent same-grantId inserts. Losing the race returns no row;
      // throw so the transaction (and the balance bump above) rolls back.
      const inserted = await tx
        .insert(transactions)
        .values({
          userId,
          type: "admin_grant",
          creditsDelta: credits,
          balanceAfter,
          metadata: {
            grantId,
            grantedBy,
            ...(note ? { note } : {}),
          },
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });
      if (inserted.length === 0) {
        throw new DuplicateGrantConflict();
      }

      return { ok: true as const, duplicate: false, balanceAfter };
    });
  } catch (err) {
    if (!(err instanceof DuplicateGrantConflict)) throw err;
    // Concurrent duplicate — our transaction rolled back; report the
    // winner's outcome, exactly like the fast path does.
    const winner = await db
      .select({ balanceAfter: transactions.balanceAfter })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "admin_grant"),
          sql`${transactions.metadata} ->> 'grantId' = ${grantId}`
        )
      )
      .limit(1);
    if (winner.length === 0) {
      // Should be impossible (the conflict proves the row exists); refuse
      // to fabricate a balance.
      throw new Error(
        `grantCredits: duplicate conflict for grantId ${grantId} but no winning row found`
      );
    }
    return {
      ok: true as const,
      duplicate: true,
      balanceAfter: winner[0]!.balanceAfter,
    };
  }
}
