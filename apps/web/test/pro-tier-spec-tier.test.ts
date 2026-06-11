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

const ROOT = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("CAD-88 — migration 0023", () => {
  const sql = read("server/db/migrations/0023_digest_specs_tier.sql");

  it("adds tier column with default 'default'", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+tier text NOT NULL DEFAULT 'default'/i);
  });

  it("constrains tier to ('default', 'pro')", () => {
    expect(sql).toMatch(/CHECK \(tier IN \('default', 'pro'\)\)/);
  });

  it("constraint is named digest_specs_tier_check (matches apply-0023 verifier)", () => {
    expect(sql).toMatch(/digest_specs_tier_check/);
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
