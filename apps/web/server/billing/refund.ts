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
  reason?:
    | "already_refunded"
    | "run_delivered"
    | "run_not_found"
    | "run_skipped";
}

export type RefundSource = "mirror_charge" | "run_metadata_tier" | "spec_tier";

/**
 * CAD-224 #1 / CAD-225: pure refund-amount precedence resolver. Extracted so
 * the precedence ladder can be unit-tested without a live Postgres (the
 * surrounding refundForFailedRun is all DB calls).
 *
 * Precedence (highest first):
 *   1. mirror-charge — the actual prior `charge` row's amount. If we took
 *      money, refund exactly that, regardless of any tier metadata.
 *   2. metadata.tier.resolved — the tier the run actually RESOLVED to
 *      (post-downgrade); this is what a charge WOULD have used.
 *   3. metadata.tier.requested — the tier requested at dispatch.
 *   4. spec.tier — the spec's CURRENT tier (may have changed since the run).
 *   5. "default".
 *
 * Why `resolved` over `requested`: a pro_websearch spec downgraded to default
 * for insufficient credits must not refund 5 for a run that would have charged
 * 1. Why mirror-charge wins outright: it's the ground truth of what we took.
 */
export function resolveRefundAmount(input: {
  /** abs() of the prior charge's creditsDelta; 0 if no charge / skip row. */
  chargeAmount: number;
  tierMeta?: { requested?: string; resolved?: string } | null;
  specTier?: string | null;
}): { amount: number; source: RefundSource; tier: Tier } {
  const { chargeAmount, tierMeta, specTier } = input;
  const runTierFromMetadata = (tierMeta?.resolved ?? tierMeta?.requested) as
    | Tier
    | undefined;
  const runTier: Tier =
    runTierFromMetadata ?? ((specTier as Tier | null) ?? "default");
  if (chargeAmount > 0) {
    return { amount: chargeAmount, source: "mirror_charge", tier: runTier };
  }
  const source: RefundSource =
    runTierFromMetadata !== undefined ? "run_metadata_tier" : "spec_tier";
  return { amount: creditCostForTier(runTier), source, tier: runTier };
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
      // CAD-224 #1 / CAD-225: tier AT RUN TIME, stamped by the pipeline on
      // runMetadata.tier as { requested, resolved }. The refund precedence
      // (resolveRefundAmount) prefers `resolved` over `requested` over the
      // spec's CURRENT tier — the spec's tier can have changed since the run
      // (e.g. a default run, brief later switched to a 5-credit stack →
      // spec-tier fallback would refund 5 for a run that charged 0/1).
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
  // Review CTO P2-3: skipped occurrences (skipped_no_credits,
  // skipped_unlinked, future skipped_*) never charged the user — the
  // pipeline writes a creditsDelta:0 marker row at most. Without this
  // guard the spec-tier fallback below would "refund" money that was
  // never taken, minting credits.
  if (run.status.startsWith("skipped")) {
    return { refunded: false, reason: "run_skipped" };
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
  // CAD-224 #1 / CAD-225: precedence ladder lives in the pure helper
  // (mirror-charge > metadata.resolved > metadata.requested > spec.tier >
  // default) so it can be unit-tested without a live DB.
  const tierMeta = (
    run.runMetadata as { tier?: { requested?: string; resolved?: string } } | null
  )?.tier;
  const {
    amount: refundAmount,
    source: resolvedRefundSource,
    tier: runTier,
  } = resolveRefundAmount({
    chargeAmount,
    tierMeta,
    specTier: run.specTier as string | null,
  });

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
          // charge row, or inferred from the run/spec tier? `refundSource`
          // comes straight from the precedence helper so the recorded
          // provenance can never drift from the amount it explains.
          tier:
            (charge?.metadata as { tier?: string } | undefined)?.tier ??
            (runTier as string | null) ??
            "default",
          refundSource: resolvedRefundSource,
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
