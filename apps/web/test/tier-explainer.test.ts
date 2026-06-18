/**
 * CAD-95 + CAD-96 — tier explainer copy pinned across surfaces.
 *
 * Tier copy lives in ONE component (TierExplainer) and is reused by
 * /settings/billing, /spec, and /pricing. Source-level assertions guard
 * three things:
 *
 *   1. The canonical copy ("1 credit per brief", "3 credits per brief",
 *      the "reads more sources … tighter analysis" value framing, footer
 *      marker note) actually appears in the shared component — so a
 *      drive-by edit can't quietly delete a positioning beat.
 *   2. All three consumers actually import and render the component, so
 *      we don't accidentally orphan one of them and let drift creep in.
 *   3. The component exposes the "compact" variant for the /spec tooltip
 *      surface where vertical space is tight.
 *
 * Why source-string assertions over a full DOM render: matches the
 * existing pattern in app-nav.test.ts, avoids dragging in
 * @testing-library/react for what is fundamentally a content-pin test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const explainerSource = read("../components/billing/tier-explainer.tsx");
const billingClientSource = read("../app/settings/billing/billing-client.tsx");
// Wave 6 Bug 13: TierExplainer's per-spec mount moved from the legacy
// /spec page into the new /briefs/[id] Advanced tab.
const briefDetailClientSource = read("../app/watches/[id]/brief-detail-client.tsx");
const pricingSource = read("../app/(marketing)/pricing/page.tsx");

describe("TierExplainer canonical copy (CAD-95 + CAD-96 + CAD-202)", () => {
  it("names standard research price + value prop", () => {
    expect(explainerSource).toMatch(/Standard research/);
    expect(explainerSource).toMatch(/1 credit/);
    // "Smart enough for most briefs" is the canonical standard framing.
    expect(explainerSource).toMatch(/Smart enough for most briefs/);
  });

  it("names advanced research price + value prop", () => {
    expect(explainerSource).toMatch(/🔬 Advanced research/);
    // Review P1-6 / founder per-stack pricing: the explainer names both
    // advanced prices and points at the per-option display.
    expect(explainerSource).toMatch(/3 or 5 credits/);
    // Plain-English value framing is the positioning hook — no vendor names
    // in user-facing copy.
    expect(explainerSource).toMatch(/reads more sources/);
    expect(explainerSource).toMatch(/tighter\s+analysis/);
  });

  it("calls out the advanced footer marker so users can self-verify which research mode they got", () => {
    expect(explainerSource).toMatch(/footer marker/i);
  });

  it("retires plan-tier nouns from user-facing copy (CAD-202 — no Pro plan, no Default tier)", () => {
    // OPTION A: drop tier nouns entirely from user-facing copy. The
    // internal digest_specs.tier="default"|"pro" mechanism stays, but the
    // surface presents research-depth configuration, not plan tiers.
    expect(explainerSource).not.toMatch(/Pro tier/);
    expect(explainerSource).not.toMatch(/Default tier/);
    expect(explainerSource).not.toMatch(/Pro plan/);
    expect(explainerSource).not.toMatch(/which tier/);
  });

  it("exposes a compact variant for tight surfaces (e.g. /spec tooltip)", () => {
    expect(explainerSource).toMatch(/variant\s*=\s*"compact"|variant\?:\s*"full"\s*\|\s*"compact"/);
  });
});

describe("TierExplainer is wired into all three surfaces", () => {
  it("is imported + rendered on /settings/billing", () => {
    expect(billingClientSource).toMatch(
      /from\s+["']@\/components\/billing\/tier-explainer["']/
    );
    expect(billingClientSource).toMatch(/<TierExplainer/);
  });

  it("is imported + rendered on /briefs/[id] (with compact variant for the tooltip)", () => {
    expect(briefDetailClientSource).toMatch(
      /from\s+["']@\/components\/billing\/tier-explainer["']/
    );
    expect(briefDetailClientSource).toMatch(/<TierExplainer\s+variant="compact"/);
  });

  it("is imported + rendered on /pricing", () => {
    expect(pricingSource).toMatch(
      /from\s+["']@\/components\/billing\/tier-explainer["']/
    );
    expect(pricingSource).toMatch(/<TierExplainer/);
  });
});
