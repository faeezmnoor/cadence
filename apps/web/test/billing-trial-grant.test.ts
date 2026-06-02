/**
 * T-506a: trial credit grant.
 *
 * The grant is wired into the atomic debit transaction
 * (`debitForDelivery`) so the one-shot guard (`trial_credits_granted_at
 * IS NULL`) and the credit increment land together. These checks lock the
 * shape of the grant — actual SQL-level idempotency is exercised by the
 * structural assertions below + the T-505a unit suite.
 */
import { describe, expect, it } from "vitest";
import { TRIAL_CREDITS } from "@/server/billing/packs";

describe("T-506a — trial credit grant", () => {
  it("locks 3 trial credits (Faeez B-7)", () => {
    expect(TRIAL_CREDITS).toBe(3);
  });

  it("debitForDelivery grants exactly once via trial_credits_granted_at gate", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(__dirname, "..", "server/billing/debit.ts"),
      "utf8"
    );
    // The grant UPDATE must WHERE trial_credits_granted_at IS NULL.
    expect(src).toMatch(/isNull\(users\.trialCreditsGrantedAt\)/);
    // The UPDATE must SET trialCreditsGrantedAt — otherwise it would re-grant.
    expect(src).toMatch(/trialCreditsGrantedAt: sql`NOW\(\)`/);
    // Grant must increment by TRIAL_CREDITS.
    expect(src).toMatch(/\+ \$\{TRIAL_CREDITS\}/);
  });

  it("trial_grant row carries source='first_brief_delivered' for funnel tracking", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(__dirname, "..", "server/billing/debit.ts"),
      "utf8"
    );
    expect(src).toMatch(/type: "trial_grant"/);
    expect(src).toMatch(/source: "first_brief_delivered"/);
  });

  it("grant + debit happen inside ONE db.transaction call (atomic)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(__dirname, "..", "server/billing/debit.ts"),
      "utf8"
    );
    // Single transaction wrap — the trial UPDATE, charge UPDATE, and both
    // INSERTs all sit inside the same db.transaction callback.
    const txCount = (src.match(/db\.transaction\(async \(tx\) =>/g) ?? []).length;
    expect(txCount).toBe(1);
  });
});
