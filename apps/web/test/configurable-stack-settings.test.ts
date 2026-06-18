/**
 * CAD-203 — Configurable Stack Settings structural pin.
 *
 * Asserts the new Configurable Stack Settings card on /briefs/[id] Advanced
 * tab is wired correctly:
 *   - Imports the research-stack lib helpers (single source of truth)
 *   - Renders a current-stack badge + transparency table testids
 *   - Uses the existing briefs.setTier mutation (no new tRPC procedure)
 *   - Keeps the gating predicate (proTierAlphaEnabled)
 *   - Copy discipline: no "Pro plan" / "Pro tier" / "upgrade to Pro" nouns
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const clientSource = read("../app/watches/[id]/brief-detail-client.tsx");

describe("CAD-203 — Configurable Stack Settings wiring", () => {
  it("imports the research-stack helpers (SSoT)", () => {
    expect(clientSource).toMatch(
      /from\s+"@\/lib\/research-stack"/
    );
    expect(clientSource).toMatch(/STACK_COSTS/);
    expect(clientSource).toMatch(/STACK_DESCRIPTIONS/);
    expect(clientSource).toMatch(/monthlyCreditEstimate/);
    expect(clientSource).toMatch(/nextDeliveryCost/);
    expect(clientSource).toMatch(/stackLabel/);
  });

  it("renders the Configurable Stack Settings card behind the alpha gate", () => {
    expect(clientSource).toMatch(/ConfigurableStackSettings/);
    expect(clientSource).toMatch(/proTierAlphaEnabled\s*&&\s*brief/);
  });

  it("surfaces a current-stack badge testid", () => {
    expect(clientSource).toMatch(/data-testid="current-stack-badge"/);
  });

  it("surfaces a live credit cost preview testid", () => {
    expect(clientSource).toMatch(/data-testid="stack-cost-preview"/);
  });

  it("surfaces a transparency table testid", () => {
    expect(clientSource).toMatch(/data-testid="stack-transparency-table"/);
  });

  it("reuses the existing briefs.setTier mutation (no new procedure / schema)", () => {
    expect(clientSource).toMatch(/trpc\.briefs\.setTier\.useMutation/);
    // No newly invented mutations leaked:
    expect(clientSource).not.toMatch(/trpc\.briefs\.setStack/);
    expect(clientSource).not.toMatch(/trpc\.briefs\.setResearchDepth/);
  });

  it("save button uses 'Switch research depth' wording (no 'upgrade')", () => {
    expect(clientSource).toMatch(/Switch research depth/);
    // Specifically: no "upgrade to Pro" / "Upgrade" CTA on this card.
    expect(clientSource).not.toMatch(/Upgrade to Pro/i);
    expect(clientSource).not.toMatch(/Upgrade plan/i);
  });

  it("does not re-introduce plan-tier nouns in user-facing copy", () => {
    // CAD-202 + project_cadence_no_tier_plans: 'Pro plan', 'Pro tier',
    // 'Default tier' are all banned in user-facing strings. Internal
    // tier="default"|"pro" enum is still fine (we toggle it via setTier).
    // We grep only the JSX/copy regions by looking for these phrases as
    // standalone strings — the literal enum value 'pro' as a code token
    // doesn't match these multi-word phrases.
    expect(clientSource).not.toMatch(/Pro plan/);
    expect(clientSource).not.toMatch(/Pro tier/);
    expect(clientSource).not.toMatch(/Default tier/);
  });
});
