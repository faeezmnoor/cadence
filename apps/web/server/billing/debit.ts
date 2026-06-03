/**
 * T-505a: Per-brief debit + skip-when-broke gate.
 *
 * Two responsibilities — kept in one module so the rules are co-located:
 *
 *   1. `shouldSkipForCredits(user)` — runs BEFORE the composer in
 *      digest/run.ts so we don't pay LLM cost for a brief we'll never
 *      deliver. Returns { skip: true, reason: 'no_credits' } when balance
 *      is already ≤ −1 (PRD §6.1: 1-brief grace credit means 0 still
 *      delivers, −1 is broke).
 *
 *   2. `debitForDelivery({ userId, digestRunId })` — runs AFTER a
 *      successful Telegram send. Atomic UPDATE + INSERT in one
 *      transaction so the ledger never disagrees with the user balance:
 *
 *        UPDATE users
 *          SET credits_balance = credits_balance - 1,
 *              cost_to_us_micro_usd = cost_to_us_micro_usd + :cost_micro
 *          WHERE id = :user_id
 *          RETURNING credits_balance;
 *
 *        INSERT INTO transactions
 *          (user_id, type, credits_delta, balance_after,
 *           digest_run_id, cost_to_us_micro_usd)
 *          VALUES
 *          (:user_id, 'charge', -1, :balance, :digest_run_id, :cost_micro);
 *
 *      Cost-to-us pulls from T-512a (`costToUsMicroUsdForRun`).
 *
 * Why no SELECT-FOR-UPDATE: `UPDATE ... RETURNING balance_after` returns
 * the post-decrement value atomically. Two concurrent debits would each
 * decrement and each return the post-value they observed — no torn write.
 *
 * Skip path observability:
 *   On skip (balance ≤ −1) we ALSO write a transactions row
 *   `{ type: 'charge', credits_delta: 0, balance_after: <unchanged>,
 *      metadata: { skipped: true, reason: 'no_credits' } }`
 *   so the admin viewer can see paused deliveries without inferring
 *   from absence-of-row. This row is the trigger for the one-time
 *   pause notification (T-507a-adjacent — keyed off the metadata flag).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactions, users } from "@/server/db/schema";
import { costToUsMicroUsdForRun, creditCostForTier, type Tier } from "./cost";

/**
 * PRD §6.1: 1-brief grace credit means a user at balance=0 still gets
 * one final brief; only balance ≤ −1 is broke.
 */
export const SKIP_THRESHOLD = -1;

export interface SkipDecision {
  skip: boolean;
  reason?: "no_credits";
  balance: number;
}

/**
 * Synchronous decision based on a SELECT we already issued upstream.
 * Pass `user.creditsBalance` so we don't double-fetch.
 */
export function shouldSkipForCredits(creditsBalance: number): SkipDecision {
  if (creditsBalance <= SKIP_THRESHOLD) {
    return { skip: true, reason: "no_credits", balance: creditsBalance };
  }
  return { skip: false, balance: creditsBalance };
}

export interface DebitResult {
  /** Post-decrement balance from `UPDATE ... RETURNING`. */
  balanceAfter: number;
  /** Micro-USD attributed to this brief (from costToUsMicroUsdForRun). */
  costMicros: number;
  /** id of the transactions row we just inserted. */
  transactionId: string;
  /**
   * T-506b: trial grant moved to signup (DB trigger handle_new_auth_user).
   * Field retained on the result for caller compatibility; always false.
   */
  trialGranted: boolean;
}

export async function debitForDelivery(params: {
  userId: string;
  digestRunId: string;
  /**
   * CAD-89: which tier actually delivered this brief. Reads through
   * `creditCostForTier` so Pro debits 3 credits, default debits 1.
   *
   * Note: this is the RESOLVED tier (what actually ran), not the spec's
   * requested tier. A Pro-requested brief that downgraded to default
   * (insufficient balance) should pass "default" here so we debit 1.
   * Defaults to "default" so callers that haven't been updated stay
   * backwards-compatible.
   */
  tier?: Tier;
}): Promise<DebitResult> {
  const { userId, digestRunId, tier = "default" } = params;
  const creditCost = creditCostForTier(tier);
  const cost = await costToUsMicroUsdForRun(digestRunId);

  // Drizzle wraps `db.transaction(tx => ...)` in a real Postgres transaction.
  return await db.transaction(async (tx) => {
    // T-506b: trial grant is no longer wired here. It fires on signup
    // via the public.handle_new_auth_user() DB trigger (migration 0013),
    // so by the time we reach debitForDelivery the user already has their
    // 3-credit grant (or already spent it). `trialGranted` is kept on the
    // return shape for caller compatibility but is always false now.
    const updated = await tx
      .update(users)
      .set({
        creditsBalance: sql`${users.creditsBalance} - ${creditCost}`,
        costToUsMicroUsd: sql`${users.costToUsMicroUsd} + ${cost.micros}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ balance: users.creditsBalance });

    const balanceAfter = updated[0]?.balance;
    if (balanceAfter == null) {
      throw new Error(`debitForDelivery: user ${userId} not found during UPDATE`);
    }

    const inserted = await tx
      .insert(transactions)
      .values({
        userId,
        type: "charge",
        creditsDelta: -creditCost,
        balanceAfter,
        digestRunId,
        costToUsMicroUsd: cost.micros,
        metadata: {
          // Snapshot for audits — distinguishes a $0.005-fallback row from
          // a real-LLM-cost row without joining cost_events.
          costSource: cost.usedFallback ? "fallback" : "cost_events",
          costEventCount: cost.eventCount,
          // CAD-89: tier snapshot. Pro debits show "🔬 Pro" in the
          // billing ledger; also drives the refund-amount lookup.
          tier,
        },
      })
      .returning({ id: transactions.id });

    return {
      balanceAfter,
      costMicros: cost.micros,
      transactionId: inserted[0]!.id,
      trialGranted: false,
    };
  });
}

/**
 * Skip-path bookkeeping. Called BEFORE the composer when
 * shouldSkipForCredits returns skip=true. Writes a zero-credit-delta
 * 'charge' row with metadata.skipped=true so dashboards can see paused
 * deliveries and the one-time pause notification logic can key off it.
 *
 * Idempotency: we de-dupe per (user_id, digest_run_id) so retries don't
 * spam the ledger. digest_run_id is unique per claim (T-302 idempotency),
 * so passing it through is sufficient.
 */
export async function recordSkipForCredits(params: {
  userId: string;
  digestRunId: string;
  balance: number;
}): Promise<{ inserted: boolean }> {
  const { userId, digestRunId, balance } = params;

  const existing = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.digestRunId, digestRunId),
        eq(transactions.type, "charge")
      )
    )
    .limit(1);
  if (existing.length > 0) return { inserted: false };

  await db.insert(transactions).values({
    userId,
    type: "charge",
    creditsDelta: 0,
    balanceAfter: balance,
    digestRunId,
    costToUsMicroUsd: 0,
    metadata: { skipped: true, reason: "no_credits" },
  });
  return { inserted: true };
}

/**
 * Has this user already received a pause notification for the current
 * out-of-credits episode? An "episode" starts when balance drops below
 * SKIP_THRESHOLD and ends when balance returns ≥ 0 (next topup).
 *
 * Heuristic: look for the most-recent topup OR the most-recent
 * pause-notification-marker row. If the marker is newer than any topup,
 * we've already notified for this episode; suppress.
 *
 * We use a transactions row with `type='promo'` and
 * metadata.pauseNotified=true as the marker — `promo` is the spare slot
 * in the type vocabulary that has no side-effects on balance accounting
 * (credits_delta=0 keeps balance untouched).
 */
export async function shouldSendPauseNotification(userId: string): Promise<boolean> {
  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      metadata: transactions.metadata,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), isNull(transactions.digestRunId))
    )
    .orderBy(sql`${transactions.createdAt} DESC`)
    .limit(20);

  for (const r of rows) {
    if (r.type === "topup" || r.type === "admin_grant" || r.type === "trial_grant") {
      // Hit a topup before a marker — episode is fresh, send the notification.
      return true;
    }
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    if (md.pauseNotified === true) {
      // Already notified this episode.
      return false;
    }
  }
  // No relevant rows in recent history → notify.
  return true;
}

export async function markPauseNotified(userId: string): Promise<void> {
  await db.insert(transactions).values({
    userId,
    type: "promo",
    creditsDelta: 0,
    balanceAfter: 0, // sentinel — readers should ignore on marker rows
    metadata: { pauseNotified: true },
  });
}
