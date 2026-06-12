/**
 * Review CTO P2-3: refundForFailedRun must early-return for skipped
 * occurrences (skipped_no_credits, skipped_unlinked, any future
 * skipped_*) — those runs never charged the user, so the spec-tier
 * fallback path would otherwise MINT credits ("refunding" up to 5 for a
 * pro_websearch spec that took nothing).
 *
 * Also locks the positive control: a genuinely failed run still refunds.
 *
 * Harness: module-boundary db mock (digest-retry.test.ts pattern) — each
 * db.select() consumes the next queued result, the transaction callback
 * runs against a recording tx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: {
  /** Queue of result sets, one per db.select() call, in call order. */
  selectResults: unknown[][];
  txUpdateReturning: Array<{ balance: number }>;
  txInsertReturning: Array<{ id: string }>;
  transactionCalls: number;
} = {
  selectResults: [],
  txUpdateReturning: [],
  txInsertReturning: [],
  transactionCalls: 0,
};

vi.mock("@/server/db/client", () => {
  function selectChain() {
    const result = Promise.resolve(state.selectResults.shift() ?? []);
    const chain = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      limit: () => result,
    };
    return chain;
  }
  const tx = {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(state.txUpdateReturning),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve(state.txInsertReturning),
      }),
    }),
  };
  return {
    db: {
      select: () => selectChain(),
      transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
        state.transactionCalls++;
        return fn(tx);
      },
    },
  };
});

import { refundForFailedRun } from "@/server/billing/refund";

function runRow(status: string, specTier = "pro_websearch") {
  return {
    id: "run-1",
    userId: "user-1",
    status,
    runMetadata: {},
    specTier,
  };
}

beforeEach(() => {
  state.selectResults = [];
  state.txUpdateReturning = [{ balance: 7 }];
  state.txInsertReturning = [{ id: "txn-refund-1" }];
  state.transactionCalls = 0;
});

describe("refundForFailedRun — skipped occurrences (CTO P2-3)", () => {
  it.each(["skipped_no_credits", "skipped_unlinked"])(
    "%s never charged → refunded:false reason:run_skipped, no ledger write",
    async (status) => {
      // pro_websearch spec on purpose: pre-fix, the spec-tier fallback
      // would have credited 5 for a run that took 0.
      state.selectResults = [[runRow(status)]];

      const res = await refundForFailedRun({
        digestRunId: "run-1",
        refundedBy: "admin@cadence.news",
      });

      expect(res).toEqual({ refunded: false, reason: "run_skipped" });
      // Early return: no charge lookup, no transaction, no balance write.
      expect(state.selectResults).toHaveLength(0);
      expect(state.transactionCalls).toBe(0);
    }
  );

  it("delivered runs still win over the skip guard (ordering lock)", async () => {
    state.selectResults = [[runRow("delivered")]];
    const res = await refundForFailedRun({
      digestRunId: "run-1",
      refundedBy: "admin@cadence.news",
    });
    expect(res).toEqual({ refunded: false, reason: "run_delivered" });
    expect(state.transactionCalls).toBe(0);
  });

  it("positive control: a genuinely failed run still refunds through the ledger", async () => {
    state.selectResults = [
      [runRow("failed", "default")], // run lookup
      [{ creditsDelta: -1, metadata: { tier: "default" } }], // prior charge
      [], // no existing refund row
    ];

    const res = await refundForFailedRun({
      digestRunId: "run-1",
      refundedBy: "admin@cadence.news",
      reason: "outage make-good",
    });

    expect(res).toEqual({
      refunded: true,
      balanceAfter: 7,
      transactionId: "txn-refund-1",
    });
    expect(state.transactionCalls).toBe(1);
  });
});
