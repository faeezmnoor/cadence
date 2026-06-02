/**
 * T-502a: pack ladder constants — parity between the TS source of truth
 * (`server/billing/packs.ts`) and the seed script (`server/db/seed-pricing-snapshots.mjs`).
 *
 * The seed script intentionally inlines the constants (raw node, no TS).
 * This test guarantees the two stay in lockstep — drift would mean the
 * FE renders one ladder while the DB charges another.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PACKS,
  PACK_LABELS,
  TRIAL_CREDITS,
  FX_USD_TO_MYR_V1,
  COST_TO_US_MICRO_PER_CREDIT_V1,
  getPack,
  perCreditUsdMinor,
} from "@/server/billing/packs";

const SEED_SQL = readFileSync(
  path.join(__dirname, "..", "server/db/seed-pricing-snapshots.mjs"),
  "utf8"
);

describe("T-502a — pack ladder constants", () => {
  it("locks the 4-pack ladder (taste/standard/power/pro)", () => {
    expect(PACKS.map((p) => p.packId)).toEqual(["taste", "standard", "power", "pro"]);
    expect(PACKS).toHaveLength(4);
  });

  it("locks credits ladder 30/70/200/1000", () => {
    expect(PACKS.map((p) => p.credits)).toEqual([30, 70, 200, 1000]);
  });

  it("locks USD ladder $5/$10/$25/$100 (cents)", () => {
    expect(PACKS.map((p) => p.priceMinorUsd)).toEqual([500, 1000, 2500, 10000]);
  });

  it("locks MYR ladder RM23/RM47/RM118/RM470 (sen, nearest RM 0.50)", () => {
    expect(PACKS.map((p) => p.priceMinorMyr)).toEqual([2300, 4700, 11800, 47000]);
  });

  it("MYR prices are all on the RM 0.50 grid (Faeez B-8)", () => {
    for (const p of PACKS) {
      expect(p.priceMinorMyr % 50).toBe(0);
    }
  });

  it("marks standard pack as best-value, others unmarked", () => {
    expect(getPack("standard").highlight).toBe("best_value");
    expect(getPack("taste").highlight).toBeUndefined();
    expect(getPack("power").highlight).toBeUndefined();
    expect(getPack("pro").highlight).toBeUndefined();
  });

  it("3 trial credits — literal three (Faeez B-7)", () => {
    expect(TRIAL_CREDITS).toBe(3);
  });

  it("per-credit USD rate descends as you scale up", () => {
    const rates = PACKS.map(perCreditUsdMinor);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThan(rates[i - 1]!);
    }
  });

  it("FX snapshot is 4.70 (v1 baseline)", () => {
    expect(FX_USD_TO_MYR_V1).toBeCloseTo(4.7);
  });

  it("COGS estimate is 5000 micro-USD / credit (= $0.005)", () => {
    expect(COST_TO_US_MICRO_PER_CREDIT_V1).toBe(5000);
  });

  it("exposes a label per pack", () => {
    for (const p of PACKS) {
      expect(PACK_LABELS[p.packId]).toBeTruthy();
    }
  });
});

describe("T-502a — seed script parity", () => {
  it("seed script mentions each pack id", () => {
    for (const p of PACKS) {
      expect(SEED_SQL).toContain(`packId: "${p.packId}"`);
    }
  });

  it("seed script encodes the same credits", () => {
    for (const p of PACKS) {
      expect(SEED_SQL).toContain(`credits: ${p.credits}`);
    }
  });

  it("seed script encodes the same USD prices", () => {
    for (const p of PACKS) {
      expect(SEED_SQL).toContain(`priceMinorUsd: ${p.priceMinorUsd}`);
    }
  });

  it("seed script encodes the same MYR prices", () => {
    for (const p of PACKS) {
      expect(SEED_SQL).toContain(`priceMinorMyr: ${p.priceMinorMyr}`);
    }
  });

  it("seed script uses the v1 FX snapshot", () => {
    expect(SEED_SQL).toContain('FX_USD_TO_MYR = "4.700000"');
  });

  it("seed script uses the v1 COGS estimate", () => {
    expect(SEED_SQL).toContain(`COST_TO_US_MICRO_PER_CREDIT = ${COST_TO_US_MICRO_PER_CREDIT_V1}`);
  });

  it("seed is idempotent — skips packs that already have an active row", () => {
    expect(SEED_SQL).toMatch(/active_to IS NULL/);
    expect(SEED_SQL).toMatch(/skip.*active row exists/);
  });
});
