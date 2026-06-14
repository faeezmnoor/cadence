/**
 * Settings-surfacing v1 (gap 10): admin credit grant — ledger invariants.
 *
 * Under test (server/billing/grant.ts):
 *   - the grant is one atomic transaction: UPDATE users balance, then
 *     INSERT the admin_grant ledger row with balance_after from the
 *     UPDATE ... RETURNING (debit.ts pattern — ledger never disagrees
 *     with the balance).
 *   - idempotency: the same client-generated grantId applied twice
 *     produces ONE ledger row and bumps the balance ONCE — the second
 *     call returns duplicate=true with the original balance.
 *   - concurrency (review CTO P2-2): when the fast-path SELECT misses but
 *     the ledger INSERT conflicts on the 0028 partial unique index
 *     (onConflictDoNothing returns no row), the transaction aborts (the
 *     balance bump rolls back) and the call reports duplicate=true with
 *     the winning row's balance.
 *   - metadata carries grantId + grantedBy for the audit trail.
 *
 * Harness: module-boundary db mock (digest-retry.test.ts pattern) — the
 * transaction callback runs against a recording tx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const updateCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const insertCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const state: {
  existingGrantRows: Array<{ id: string; balanceAfter: number }>;
  updateReturning: Array<{ balance: number }>;
  /** Rows the ledger INSERT's onConflictDoNothing().returning() yields —
   *  empty simulates losing the 0028 unique-index race (CTO P2-2). */
  insertReturning: Array<{ id: string }>;
  /** Rows the OUTER (post-rollback) winner re-read returns. */
  winnerRows: Array<{ balanceAfter: number }>;
  /** True while a transaction callback threw — emulates the rollback. */
  rolledBack: boolean;
} = {
  existingGrantRows: [],
  updateReturning: [],
  insertReturning: [],
  winnerRows: [],
  rolledBack: false,
};

vi.mock("@/server/db/client", () => {
  const tx = {
    select() {
      const chain = {
        from() {
          return chain;
        },
        where() {
          return chain;
        },
        limit() {
          return Promise.resolve(state.existingGrantRows);
        },
      };
      return chain;
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          updateCalls.push({ table, values });
          return {
            where: () => ({
              returning: () => Promise.resolve(state.updateReturning),
            }),
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(v: Record<string, unknown>) {
          insertCalls.push({ table, values: v });
          return {
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve(state.insertReturning),
            }),
          };
        },
      };
    },
  };
  return {
    db: {
      transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => {
        try {
          return await fn(tx);
        } catch (err) {
          // A throw aborts the (mock) transaction — flag it so the test
          // can assert the balance bump did not survive.
          state.rolledBack = true;
          throw err;
        }
      },
      // Outer (non-tx) read used by the CTO P2-2 conflict path to report
      // the winning grant's balance.
      select() {
        const chain = {
          from() {
            return chain;
          },
          where() {
            return chain;
          },
          limit() {
            return Promise.resolve(state.winnerRows);
          },
        };
        return chain;
      },
    },
  };
});

import { grantCredits } from "@/server/billing/grant";
import { transactions, users } from "@/server/db/schema";

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  state.existingGrantRows = [];
  state.updateReturning = [{ balance: 13 }];
  state.insertReturning = [{ id: "txn-new" }];
  state.winnerRows = [];
  state.rolledBack = false;
});

describe("grantCredits — happy path", () => {
  it("bumps the balance and writes one attributable admin_grant ledger row", async () => {
    const res = await grantCredits({
      userId: "user-1",
      credits: 10,
      grantId: "11111111-1111-4111-8111-111111111111",
      grantedBy: "faeezmnoor@gmail.com",
      note: "requestCredits ping 2026-06-13",
    });

    expect(res).toEqual({ ok: true, duplicate: false, balanceAfter: 13 });

    // Exactly one balance UPDATE on users.
    const userUpdates = updateCalls.filter((c) => c.table === users);
    expect(userUpdates).toHaveLength(1);

    // Exactly one ledger INSERT, through the ledger (never a raw balance
    // write without its transactions row).
    const ledgerInserts = insertCalls.filter((c) => c.table === transactions);
    expect(ledgerInserts).toHaveLength(1);
    const row = ledgerInserts[0]!.values;
    expect(row.type).toBe("admin_grant");
    expect(row.creditsDelta).toBe(10);
    expect(row.balanceAfter).toBe(13); // from UPDATE ... RETURNING
    expect(row.metadata).toMatchObject({
      grantId: "11111111-1111-4111-8111-111111111111",
      grantedBy: "faeezmnoor@gmail.com",
      note: "requestCredits ping 2026-06-13",
    });
  });

  it("rejects non-positive / non-integer amounts before touching the db", async () => {
    for (const credits of [0, -5, 2.5]) {
      await expect(
        grantCredits({
          userId: "user-1",
          credits,
          grantId: "11111111-1111-4111-8111-111111111111",
          grantedBy: "admin",
        })
      ).rejects.toThrow(/positive integer/);
    }
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});

describe("grantCredits — idempotency (same grantId twice)", () => {
  it("second submission with the same grantId writes nothing and reports duplicate", async () => {
    const grantId = "22222222-2222-4222-8222-222222222222";

    // First call: no existing row → applies.
    const first = await grantCredits({
      userId: "user-1",
      credits: 10,
      grantId,
      grantedBy: "admin",
    });
    expect(first.duplicate).toBe(false);
    expect(first.balanceAfter).toBe(13);

    // The row now exists (check-before-insert sees it inside the second
    // transaction).
    state.existingGrantRows = [{ id: "txn-1", balanceAfter: 13 }];

    const second = await grantCredits({
      userId: "user-1",
      credits: 10,
      grantId,
      grantedBy: "admin",
    });
    expect(second).toEqual({ ok: true, duplicate: true, balanceAfter: 13 });

    // One ledger row total, balance bumped once — the double-click /
    // retried request cannot double-credit.
    expect(insertCalls.filter((c) => c.table === transactions)).toHaveLength(1);
    expect(updateCalls.filter((c) => c.table === users)).toHaveLength(1);
  });
});

describe("grantCredits — concurrency (review CTO P2-2)", () => {
  it("losing the unique-index race aborts the transaction and reports the winner", async () => {
    // Both concurrent calls passed the fast-path SELECT (READ COMMITTED)…
    state.existingGrantRows = [];
    // …but THIS call's INSERT hits the 0028 partial unique index:
    // onConflictDoNothing yields no row.
    state.insertReturning = [];
    // The winning grant's ledger row, visible after our rollback.
    state.winnerRows = [{ balanceAfter: 23 }];

    const res = await grantCredits({
      userId: "user-1",
      credits: 10,
      grantId: "33333333-3333-4333-8333-333333333333",
      grantedBy: "admin",
    });

    // Conflict is reported as a duplicate carrying the winner's balance —
    // never a second credit.
    expect(res).toEqual({ ok: true, duplicate: true, balanceAfter: 23 });

    // The transaction threw (mock flags it) so the balance UPDATE rolled
    // back — the loser leaves no trace.
    expect(state.rolledBack).toBe(true);
  });

  it("refuses to fabricate a balance if the winning row cannot be re-read", async () => {
    state.existingGrantRows = [];
    state.insertReturning = [];
    state.winnerRows = []; // impossible in practice; must throw, not invent
    await expect(
      grantCredits({
        userId: "user-1",
        credits: 10,
        grantId: "44444444-4444-4444-8444-444444444444",
        grantedBy: "admin",
      })
    ).rejects.toThrow(/no winning row/);
  });
});
