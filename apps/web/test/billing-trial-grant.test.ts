/**
 * T-506b: trial credit grant on signup (migration 0013).
 *
 * The grant fires from the public.handle_new_auth_user() DB trigger when
 * a new row lands in auth.users. The Postgres function:
 *   - mirrors auth.users → public.users (legacy 0002 behavior)
 *   - UPDATE users SET credits_balance = credits_balance + 3,
 *                       trial_credits_granted_at = NOW()
 *     WHERE id = NEW.id AND trial_credits_granted_at IS NULL
 *   - INSERT a transactions row with type='trial_grant',
 *     metadata.source='signup'
 *
 * These are structural assertions against the migration SQL. Live-DB
 * verification happens via the apply-0013 script's sanity probes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TRIAL_CREDITS } from "@/server/billing/packs";

const migrationSrc = readFileSync(
  path.join(__dirname, "..", "server/db/migrations/0013_trial_grant_on_signup.sql"),
  "utf8"
);
const debitSrc = readFileSync(
  path.join(__dirname, "..", "server/billing/debit.ts"),
  "utf8"
);

describe("T-506b — trial credit grant on signup", () => {
  it("locks 3 trial credits (Faeez B-7)", () => {
    expect(TRIAL_CREDITS).toBe(3);
  });

  it("migration 0013 redefines handle_new_auth_user trigger function", () => {
    expect(migrationSrc).toMatch(
      /CREATE OR REPLACE FUNCTION public\.handle_new_auth_user/
    );
  });

  it("grant UPDATE gates on trial_credits_granted_at IS NULL (idempotent)", () => {
    expect(migrationSrc).toMatch(/trial_credits_granted_at IS NULL/);
  });

  it("grant increments credits_balance by exactly 3", () => {
    expect(migrationSrc).toMatch(/credits_balance\s*\+\s*3/);
  });

  it("transactions row is type='trial_grant' with source='signup'", () => {
    expect(migrationSrc).toMatch(/'trial_grant'/);
    expect(migrationSrc).toMatch(/'source',\s*'signup'/);
  });

  it("backfills existing users whose trial_credits_granted_at IS NULL", () => {
    expect(migrationSrc).toMatch(/backfill_0013/);
    // Loop must restrict to ungranted users so existing granted users
    // never get a second grant.
    expect(migrationSrc).toMatch(
      /SELECT id FROM public\.users\s+WHERE trial_credits_granted_at IS NULL/
    );
  });

  it("debit.ts no longer fires the trial grant (moved to signup trigger)", () => {
    // The in-transaction grant block must be gone — no trial_grant insert,
    // no trialCreditsGrantedAt SET inside debit.ts.
    expect(debitSrc).not.toMatch(/type:\s*"trial_grant"/);
    expect(debitSrc).not.toMatch(/trialCreditsGrantedAt:\s*sql`NOW\(\)`/);
    expect(debitSrc).not.toMatch(/TRIAL_CREDITS/);
  });

  it("debit.ts still wraps the charge in a single db.transaction", () => {
    const txCount = (debitSrc.match(/db\.transaction\(async \(tx\) =>/g) ?? []).length;
    expect(txCount).toBe(1);
  });

  it("trigger fires AFTER INSERT on auth.users (Supabase signup hook)", () => {
    expect(migrationSrc).toMatch(/AFTER INSERT ON auth\.users/);
  });
});
