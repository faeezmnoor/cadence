/**
 * CAD-204 — Stripe SKUs v2 runbook drift guard.
 *
 * The runbook at `docs/runbooks/stripe-skus-v2.md` is the manual-setup checklist Faeez
 * follows in the Stripe dashboard once MY KYC clears. The Cadence code never
 * mutates Stripe products, so the only way the runbook can drift from `packs.ts`
 * is if a human edits one and forgets the other.
 *
 * This test fails loudly if the runbook stops mentioning every pack id, credit
 * count, or USD price from the canonical PACKS constant. Cheap, deterministic,
 * doc-test rather than code-test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PACKS } from "@/server/billing/packs";

const RUNBOOK = readFileSync(
  path.join(__dirname, "..", "..", "..", "docs/runbooks/stripe-skus-v2.md"),
  "utf8"
);

describe("CAD-204 — stripe-skus-v2 runbook parity", () => {
  it("mentions every pack id by name", () => {
    for (const p of PACKS) {
      expect(RUNBOOK).toMatch(new RegExp(`\\b${p.packId}\\b`, "i"));
    }
  });

  it("mentions every credit grant amount", () => {
    for (const p of PACKS) {
      expect(RUNBOOK).toContain(`${p.credits}`);
    }
  });

  it("mentions every USD price (whole dollars)", () => {
    for (const p of PACKS) {
      const dollars = p.priceMinorUsd / 100;
      expect(RUNBOOK).toContain(`$${dollars}`);
    }
  });

  it("declares the hard no-subscriptions / no-tiers constraint", () => {
    expect(RUNBOOK).toMatch(/no subscriptions/i);
    expect(RUNBOOK).toMatch(/no plan tiers|no tiered/i);
  });

  it("flags the KYC + manual-setup gate", () => {
    expect(RUNBOOK).toMatch(/KYC/);
    expect(RUNBOOK).toMatch(/manual/i);
  });
});
