/**
 * admin.listUsers — per-user cost dashboard access + shape.
 *
 * Mirrors admin-runs.test.ts: signed-out -> UNAUTHORIZED, signed-in
 * non-admin -> FORBIDDEN, admin -> rows with the documented shape. Also
 * covers the includeDeleted toggle (default false) by inspecting the
 * generated SQL string we capture in the db.execute mock.
 *
 * db.execute is stubbed to record the SQL it was handed and to return a
 * canned set of rows so we can assert the row mapping (snake_case ->
 * camelCase + Number() coercion of numeric-as-text columns).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

let capturedSql = "";

vi.mock("@/server/db/client", () => {
  return {
    db: {
      execute: vi.fn(async (q: { queryChunks?: unknown[]; sql?: string } | unknown) => {
        // drizzle's sql template tag returns an object with queryChunks; we
        // serialize loosely just so the test can sanity-check filter intent.
        capturedSql = JSON.stringify(q);
        return [
          {
            id: "11111111-1111-1111-1111-111111111111",
            email: "heavy@example.com",
            credits_balance: 5,
            state: "active",
            created_at: "2026-05-01T00:00:00Z",
            deleted_at: null,
            net_debits: "-20",
            total_credits_in: "25",
            cost_to_us_usd: "0.5432",
            delivered_briefs: "18",
            failed_briefs: "2",
            last_run_at: "2026-06-04T00:30:00Z",
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            email: "light@example.com",
            credits_balance: 3,
            state: "delivery_broken",
            created_at: "2026-05-20T00:00:00Z",
            deleted_at: null,
            net_debits: "-2",
            total_credits_in: "5",
            cost_to_us_usd: "0.0123",
            delivered_briefs: "2",
            failed_briefs: "0",
            last_run_at: null,
          },
        ];
      }),
    },
  };
});

import { appRouter } from "@/server/trpc/root";

function makeCtx(
  overrides: { email?: string | null; signedIn?: boolean } = {}
) {
  const signedIn = overrides.signedIn ?? true;
  return {
    user: signedIn
      ? { id: "u-self", email: overrides.email ?? "admin@example.com" }
      : null,
    supabase: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

beforeEach(() => {
  process.env.CADENCE_ADMIN_EMAILS = "admin@example.com";
  capturedSql = "";
});

describe("admin.listUsers gate", () => {
  it("rejects signed-out callers with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeCtx({ signedIn: false }));
    await expect(caller.admin.listUsers()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects signed-in non-admin with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ email: "stranger@example.com" })
    );
    await expect(caller.admin.listUsers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns mapped rows for admin caller", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const out = await caller.admin.listUsers();
    expect(out.sortBy).toBe("cost");
    expect(out.includeDeleted).toBe(false);
    expect(out.rows).toHaveLength(2);

    const heavy = out.rows[0]!;
    expect(heavy.email).toBe("heavy@example.com");
    expect(heavy.costToUsUsd).toBeCloseTo(0.5432, 4);
    expect(heavy.deliveredBriefs).toBe(18);
    expect(heavy.failedBriefs).toBe(2);
    expect(heavy.netDebits).toBe(-20);
    expect(heavy.totalCreditsIn).toBe(25);
    expect(heavy.creditsBalance).toBe(5);
    expect(heavy.lastRunAt).toBe("2026-06-04T00:30:00Z");

    const light = out.rows[1]!;
    expect(light.state).toBe("delivery_broken");
    expect(light.lastRunAt).toBeNull();
  });

  it("default excludes soft-deleted users (WHERE u.deleted_at IS NULL)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.admin.listUsers();
    // The WHERE-clause fragment is its own sql`` chunk; the JSON-serialized
    // queryChunks contain it verbatim.
    expect(capturedSql).toContain("WHERE u.deleted_at IS NULL");
  });

  it("includeDeleted=true drops the WHERE filter", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.admin.listUsers({ includeDeleted: true });
    expect(capturedSql).not.toContain("WHERE u.deleted_at IS NULL");
  });

  it("sortBy=balance routes to credits_balance ordering", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const out = await caller.admin.listUsers({ sortBy: "balance" });
    expect(out.sortBy).toBe("balance");
    expect(capturedSql).toContain("credits_balance DESC");
  });

  it("rejects sortBy outside the whitelist via Zod", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      // @ts-expect-error — intentional invalid input
      caller.admin.listUsers({ sortBy: "evil; DROP TABLE users" })
    ).rejects.toBeTruthy();
  });
});
