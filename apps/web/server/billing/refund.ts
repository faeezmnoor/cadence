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
 *     back because the user was either:
 *       (a) charged at a previous flawed code-path (pre-this-PR builds),
 *       (b) entitled to good-faith make-good per Terms ("If we miss a
 *           delivery because of an outage on our side, the credit is
 *           returned.")
 *
 * CAD-89: refund amount mirrors the original charge. If a prior `charge`
 * transaction exists for this run, refund `abs(creditsDelta)` from it
 * (Pro = 3, default = 1). Falls back to the spec's tier when there is no
 * prior charge — covers the failed-before-delivery case where we want to
 * make-good for the brief the user expected.
 *
 * Transaction:
 *     UPDATE users SET credits_balance = credits_balance + N RETURNING ...
 *     INSERT INTO transactions (..., type='refund', credits_delta=+N, ...)
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, transactions, users } from "@/server/db/schema";
import { creditCostForTier, type Tier } from "./cost";

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

  // Load + validate the run (left-joined to the owning spec so we can fall
  // back to spec.tier when there's no prior charge row to mirror)
  const runRows = await db
    .select({
      id: digestRuns.id,
      userId: digestRuns.userId,
      status: digestRuns.status,
      // CAD-224 #1: tier AT RUN TIME, stamped by the pipeline on
      // runMetadata.tier.requested — the spec's current tier can have
      // changed since (e.g. default run, brief later switched to a
      // 5-credit stack → spec-tier fallback would refund 5 for a run
      // that charged 0/1).
      runMetadata: digestRuns.metadata,
      specTier: digestSpecs.tier,
    })
    .from(digestRuns)
    .leftJoin(digestSpecs, eq(digestSpecs.id, digestRuns.specId))
    .where(eq(digestRuns.id, digestRunId))
    .limit(1);
  const run = runRows[0];
  if (!run) return { refunded: false, reason: "run_not_found" };
  if (run.status === "delivered") {
    return { refunded: false, reason: "run_delivered" };
  }

  // CAD-89: discover refund amount. Prefer the actual prior `charge` row
  // (mirror exactly what we took), fall back to the spec's tier if there
  // was no charge — failed-before-delivery case.
  const priorCharge = await db
    .select({
      creditsDelta: transactions.creditsDelta,
      metadata: transactions.metadata,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.digestRunId, digestRunId),
        eq(transactions.type, "charge")
      )
    )
    .limit(1);
  const charge = priorCharge[0];
  // Skip rows are `creditsDelta: 0, metadata.skipped: true` — those never
  // took money, so they have nothing to refund. Treat as no charge.
  const chargeAmount =
    charge && charge.creditsDelta < 0 ? Math.abs(charge.creditsDelta) : 0;
  // CAD-224 #1 precedence for the no-charge fallback: tier the RUN was
  // dispatched with (runMetadata.tier.requested) > spec's current tier >
  // default. Mirroring a real charge row still wins outright above.
  const runTier =
    ((run.runMetadata as { tier?: { requested?: string } } | null)?.tier
      ?.requested as Tier | undefined) ??
    ((run.specTier as Tier | null) ?? "default");
  const refundAmount =
    chargeAmount > 0 ? chargeAmount : creditCostForTier(runTier);

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
        creditsBalance: sql`${users.creditsBalance} + ${refundAmount}`,
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
        creditsDelta: refundAmount,
        balanceAfter,
        digestRunId,
        metadata: {
          refundedBy,
          reason: reason ?? null,
          runStatus: run.status,
          // CAD-89: provenance — was the amount mirrored from a real
          // charge row, or inferred from the spec's tier?
          tier:
            (charge?.metadata as { tier?: string } | undefined)?.tier ??
            (runTier as string | null) ??
            "default",
          refundSource: chargeAmount > 0 ? "mirror_charge" : "spec_tier",
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
