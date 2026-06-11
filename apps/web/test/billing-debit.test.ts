/**
 * T-505a: per-brief debit + skip-when-broke gate.
 *
 * Pure-unit tests for the skip decision. The DB-touching paths
 * (debitForDelivery / recordSkipForCredits / pause-notification) are
 * smoke-tested by composer integration in CI; here we lock the rule
 * boundaries so they can't drift.
 */
import { describe, expect, it } from "vitest";
import { SKIP_THRESHOLD, shouldSkipForCredits } from "@/server/billing/debit";

describe("T-505a — skip-when-broke gate", () => {
  it("does NOT skip at balance = 1 (positive)", () => {
    expect(shouldSkipForCredits(1).skip).toBe(false);
  });

  it("does NOT skip at balance = 0 (grace credit — PRD §6.1)", () => {
    const d = shouldSkipForCredits(0);
    expect(d.skip).toBe(false);
    expect(d.balance).toBe(0);
  });

  it("does NOT skip at balance = 10 (positive)", () => {
    expect(shouldSkipForCredits(10).skip).toBe(false);
  });

  it("SKIPS at balance = -1 (the grace credit was consumed)", () => {
    const d = shouldSkipForCredits(-1);
    expect(d.skip).toBe(true);
    expect(d.reason).toBe("no_credits");
    expect(d.balance).toBe(-1);
  });

  it("SKIPS at balance = -5 (deep negative)", () => {
    expect(shouldSkipForCredits(-5).skip).toBe(true);
  });

  it("threshold constant matches PRD locked rule (≤ -1)", () => {
    expect(SKIP_THRESHOLD).toBe(-1);
  });
});

describe("T-505a — run.ts wiring guarantees", () => {
  it("digest/run.ts gates BEFORE Brave/composer (no LLM cost on skip)", async () => {
    // Read the file once and assert that the skip check appears before
    // the Brave/RSS source-collection blocks. Cheap structural guard
    // against future refactors that move the gate downstream.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(__dirname, "..", "server/digest/run.ts"),
      "utf8"
    );
    const skipIdx = src.indexOf("shouldSkipForCredits");
    const braveIdx = src.indexOf("braveSearch(");
    // CAD-88: compose call now routes through providers.composer.compose(...)
    // via getProviders(spec.tier). Match the new call shape.
    const composeIdx = src.indexOf("providers.composer.compose(");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(braveIdx).toBeGreaterThan(skipIdx);
    expect(composeIdx).toBeGreaterThan(skipIdx);
  });

  it("digest/run.ts only debits after status === 'delivered'", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(__dirname, "..", "server/digest/run.ts"),
      "utf8"
    );
    // Two debit call sites (cron path + sampleNow path); both must sit
    // under a `status === "delivered"` guard.
    const matches = src.match(/debitForDelivery\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // The gate is the surrounding `if (status === "delivered")` block.
    // We assert the literal appears before the first debit invocation.
    const firstDebit = src.indexOf("debitForDelivery(");
    const gateBefore = src.lastIndexOf('status === "delivered"', firstDebit);
    expect(gateBefore).toBeGreaterThan(-1);
  });

  it("digest/run.ts bypasses the gate on dryRun (preview path)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(__dirname, "..", "server/digest/run.ts"),
      "utf8"
    );
    // The gate sits inside `if (!dryRun)` so previews bypass it.
    expect(src).toMatch(/if \(!dryRun\)[\s\S]{0,200}shouldSkipForCredits/);
  });
});

describe("CAD-222 — per-stack credit pricing", () => {
  it("creditCostForTier reads the registry: 1 / 3 / 5", async () => {
    const { creditCostForTier } = await import("@/server/billing/cost");
    expect(creditCostForTier("default")).toBe(1);
    expect(creditCostForTier("pro")).toBe(3);
    expect(creditCostForTier("pro_websearch")).toBe(5);
    // Unknown / legacy / null all bill at the standard rate — a corrupt
    // tier string must never over-charge.
    expect(creditCostForTier("something-else")).toBe(1);
    expect(creditCostForTier(null)).toBe(1);
    expect(creditCostForTier(undefined)).toBe(1);
  });
});
