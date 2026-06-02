/**
 * T-501a: schema-shape regression for the monetization substrate.
 *
 * Pure unit checks that don't require live Postgres — guards against
 * accidental drift between the Drizzle schema and the SQL migration.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pricingSnapshots, transactions, users } from "@/server/db/schema";

const MIGRATION = readFileSync(
  path.join(__dirname, "..", "server/db/migrations/0011_monetization.sql"),
  "utf8"
);

describe("0011_monetization migration SQL", () => {
  it("adds all six user monetization columns idempotently", () => {
    for (const col of [
      "credits_balance",
      "cost_to_us_micro_usd",
      "country_code",
      "auto_topup_pack_id",
      "auto_topup_threshold_credits",
      "trial_credits_granted_at",
    ]) {
      expect(MIGRATION).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
  });

  it("creates transactions + pricing_snapshots with IF NOT EXISTS", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.pricing_snapshots/);
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.transactions/);
  });

  it("enforces RLS deny-all on both new tables", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.transactions ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(
      /ALTER TABLE public\.pricing_snapshots ENABLE ROW LEVEL SECURITY/
    );
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.transactions FROM anon, authenticated/);
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON public\.pricing_snapshots FROM anon, authenticated/
    );
    expect(MIGRATION).toMatch(/USING \(false\) WITH CHECK \(false\)/);
  });

  it("makes stripe_session_id UNIQUE (partial) for webhook idempotency", () => {
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_session_id_uq[\s\S]*WHERE stripe_session_id IS NOT NULL/
    );
  });
});

describe("Drizzle schema shape", () => {
  it("exposes credits_balance + cost_to_us_micro_usd on users", () => {
    // Drizzle column objects expose `.name` for the underlying SQL column.
    const cols = users as unknown as Record<string, { name: string }>;
    expect(cols.creditsBalance.name).toBe("credits_balance");
    expect(cols.costToUsMicroUsd.name).toBe("cost_to_us_micro_usd");
    expect(cols.trialCreditsGrantedAt.name).toBe("trial_credits_granted_at");
    expect(cols.countryCode.name).toBe("country_code");
  });

  it("exposes the four expected transaction columns we'll write to", () => {
    const cols = transactions as unknown as Record<string, { name: string }>;
    expect(cols.type.name).toBe("type");
    expect(cols.creditsDelta.name).toBe("credits_delta");
    expect(cols.balanceAfter.name).toBe("balance_after");
    expect(cols.stripeSessionId.name).toBe("stripe_session_id");
  });

  it("exposes pricing_snapshots pack_id + price columns", () => {
    const cols = pricingSnapshots as unknown as Record<string, { name: string }>;
    expect(cols.packId.name).toBe("pack_id");
    expect(cols.priceMinorUsd.name).toBe("price_minor_usd");
    expect(cols.priceMinorMyr.name).toBe("price_minor_myr");
  });
});
