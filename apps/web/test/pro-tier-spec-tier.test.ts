/**
 * CAD-88: per-spec Pro tier toggle.
 *
 * Pure-unit structural tests. The DB-touching tRPC paths (setTier,
 * updateRaw with tier) are covered by integration smoke; here we lock
 * the wiring invariants so the runtime contract can't drift silently:
 *
 *   1. Migration 0023 exists with the correct CHECK constraint vocab.
 *   2. The schema.ts Drizzle model includes the tier column.
 *   3. digest/run.ts routes the compose call through getProviders(spec.tier)
 *      and records resolved tier on metadata.
 *   4. The Pro 🔬 footer is gated on BOTH the alpha flag AND a Pro
 *      resolved tier — never one alone.
 *   5. The /spec page only renders the toggle when alpha is on.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STACK_ORDER } from "@/lib/research-stack";

const ROOT = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("CAD-88 — migration 0023", () => {
  const sql = read("server/db/migrations/0023_digest_specs_tier.sql");

  it("adds tier column with default 'default'", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+tier text NOT NULL DEFAULT 'default'/i);
  });

  it("constrains tier to ('default', 'pro') — historical vocabulary as shipped", () => {
    expect(sql).toMatch(/CHECK \(tier IN \('default', 'pro'\)\)/);
  });

  it("constraint is named digest_specs_tier_check (matches apply-0023 verifier)", () => {
    expect(sql).toMatch(/digest_specs_tier_check/);
  });
});

describe("CAD-222 — migration 0027 (review P0: DB vocabulary tracks the registry)", () => {
  const sql = read("server/db/migrations/0027_tier_pro_websearch.sql");

  it("re-adds digest_specs_tier_check with the FULL three-stack vocabulary", () => {
    expect(sql).toMatch(
      /CHECK \(tier IN \('default', 'pro', 'pro_websearch'\)\)/
    );
    expect(sql).toMatch(/digest_specs_tier_check/);
  });

  it("apply runner exists and verifies the constraint predicate", () => {
    const runner = read("server/db/apply-0027.mjs");
    expect(runner).toMatch(/0027_tier_pro_websearch\.sql/);
    expect(runner).toMatch(/pro_websearch/);
  });

  it("DB vocabulary covers every registry stack (drift guard)", () => {
    // If STACK_ORDER grows a stack the newest tier-VOCABULARY migration
    // (0027 — the last one to touch the CHECK predicate) doesn't mention,
    // this fails — the exact gap the post-merge review caught. CAD-225 only
    // RETIRES a stack (data migration 0030, no constraint change), so
    // STACK_ORDER = [default, pro_websearch] both still live in 0027's
    // widened CHECK; the guard stays green.
    for (const stack of STACK_ORDER) {
      expect(sql).toContain(`'${stack}'`);
    }
  });
});

describe("CAD-225 — migration 0030 (retire dominated 'pro' stack)", () => {
  const sql = read("server/db/migrations/0030_retire_pro_stack.sql");

  it("migrates any tier='pro' spec rows to 'default' (not auto-upgraded)", () => {
    // Backward-compat ruling: a legacy 'pro' spec falls back to standard
    // (billed 1), deliberately NOT bumped to the 5-credit pro_websearch stack.
    expect(sql).toMatch(/UPDATE\s+public\.digest_specs/i);
    expect(sql).toMatch(/SET\s+tier\s*=\s*'default'/i);
    expect(sql).toMatch(/WHERE\s+tier\s*=\s*'pro'/i);
    expect(sql).toMatch(/updated_at\s*=\s*now\(\)/i);
  });

  it("leaves the CHECK constraint permissive (no constraint change in 0030)", () => {
    // 'pro' stays a valid-but-unused value for safety — 0030 must NOT
    // tighten the constraint (that would risk a legacy write violating it).
    expect(sql).not.toMatch(/digest_specs_tier_check/);
  });

  it("apply runner exists, points at the 0030 SQL, and verifies the post-state", () => {
    const runner = read("server/db/apply-0030.mjs");
    expect(runner).toMatch(/0030_retire_pro_stack\.sql/);
    // Verifier asserts zero rows remain on the retired tier.
    expect(runner).toMatch(/WHERE tier = 'pro'/);
    expect(runner).toMatch(/FAIL/);
  });
});

describe("CAD-88 — schema.ts", () => {
  const schema = read("server/db/schema.ts");
  it("digestSpecs table declares tier column", () => {
    expect(schema).toMatch(/tier:\s*text\("tier"\)\.notNull\(\)\.default\("default"\)/);
  });
});

describe("CAD-88 — digest/run.ts wiring", () => {
  const src = read("server/digest/run.ts");

  it("imports getProviders + Tier from the provider layer", () => {
    expect(src).toMatch(/from "@\/server\/ai\/providers"/);
    expect(src).toMatch(/getProviders/);
  });

  it("reads tier off specRow and calls getProviders(spec.tier)", () => {
    expect(src).toMatch(/specRow\.tier/);
    expect(src).toMatch(/getProviders\(effectiveTier\)/);
  });

  it("records requested + resolved tier on runMetadata", () => {
    expect(src).toMatch(/runMetadata\.tier\s*=/);
    expect(src).toMatch(/resolved:\s*providers\.tier/);
  });

  it("compose call goes through providers.composer.compose", () => {
    expect(src).toMatch(/providers\.composer\.compose\(composerInput\)/);
  });

  it("🔬 Pro badge is gated on resolved tier (CAD-91)", () => {
    // CAD-91: the alpha-flag gate was removed from the badge predicate
    // because the resolved tier itself already encodes the flag state
    // (getProviders falls back to "default" when the flag is off). The
    // badge now appends iff the brief was actually composed on Pro.
    // CAD-222: badge predicate generalized to the registry helper so both
    // advanced stacks carry their own footer (each naming its own price).
    expect(src).toMatch(/resolvedTier && isAdvancedStack\(resolvedTier\)/);
    expect(src).toMatch(/🔬 Advanced research — deeper digging, 3 credits\./);
    expect(src).toMatch(/🔬 Advanced research — live web search, 5 credits\./);
  });
});

describe("CAD-88 — /briefs/[id] page UI gating (ported from /spec, Wave 6 Bug 13)", () => {
  const page = read("app/briefs/[id]/page.tsx");
  const client = read("app/briefs/[id]/brief-detail-client.tsx");

  it("page passes proTierAlphaEnabled prop from server check", () => {
    expect(page).toMatch(/isProTierAlphaEnabled/);
    expect(page).toMatch(/proTierAlphaEnabled=\{isProTierAlphaEnabled\(\)\}/);
  });

  it("brief-detail-client only renders toggle when proTierAlphaEnabled is true", () => {
    expect(client).toMatch(/proTierAlphaEnabled && brief/);
    // CAD-202 copy refresh: "Research tier" → "Research depth";
    // "🔬 Pro · 3 credits" → "🔬 Advanced · 3 credits".
    expect(client).toMatch(/Research depth/);
    // CAD-222: the picker is data-driven from STACK_ORDER — assert the
    // registry wiring rather than hardcoded option strings.
    expect(client).toMatch(/STACK_ORDER\.map/);
    expect(client).toMatch(/stack-option-\$\{stack\}/);
  });

  it("setTier mutation wired through briefs router (per-brief tier)", () => {
    expect(client).toMatch(/setTier\s*=\s*trpc\.briefs\.setTier\.useMutation/);
  });
});
