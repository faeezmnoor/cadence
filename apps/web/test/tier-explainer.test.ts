/**
 * CAD-95 + CAD-96 — tier explainer copy pinned across surfaces.
 *
 * Tier copy lives in ONE component (TierExplainer) and is reused by
 * /settings/billing, /spec, and /pricing. Source-level assertions guard
 * three things:
 *
 *   1. The canonical copy ("1 credit per brief", "3 credits per brief",
 *      "Perplexity Sonar Reasoning Pro", "Claude Sonnet 4.6", footer
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
const specClientSource = read("../app/spec/spec-client.tsx");
const pricingSource = read("../app/(marketing)/pricing/page.tsx");

describe("TierExplainer canonical copy (CAD-95 + CAD-96)", () => {
  it("names the Default tier price + value prop", () => {
    expect(explainerSource).toMatch(/Default/);
    expect(explainerSource).toMatch(/1 credit/);
    // "Smart enough for most briefs" is the canonical Default framing.
    expect(explainerSource).toMatch(/Smart enough for most briefs/);
  });

  it("names the Pro tier price + value prop + provider stack", () => {
    expect(explainerSource).toMatch(/🔬 Pro/);
    expect(explainerSource).toMatch(/3 credits/);
    // The two provider names are the positioning hook — Pro isn't "more
    // expensive Default", it's a fundamentally different research stack.
    expect(explainerSource).toMatch(/Perplexity Sonar Reasoning Pro/);
    expect(explainerSource).toMatch(/Claude Sonnet 4\.6/);
  });

  it("calls out the Pro footer marker so users can self-verify which tier they got", () => {
    expect(explainerSource).toMatch(/footer marker/i);
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

  it("is imported + rendered on /spec (with compact variant for the tooltip)", () => {
    expect(specClientSource).toMatch(
      /from\s+["']@\/components\/billing\/tier-explainer["']/
    );
    expect(specClientSource).toMatch(/<TierExplainer\s+variant="compact"/);
  });

  it("is imported + rendered on /pricing", () => {
    expect(pricingSource).toMatch(
      /from\s+["']@\/components\/billing\/tier-explainer["']/
    );
    expect(pricingSource).toMatch(/<TierExplainer/);
  });
});
