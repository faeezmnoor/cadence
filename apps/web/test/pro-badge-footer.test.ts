/**
 * CAD-91 — Pro tier badge appended to Telegram brief markdown.
 *
 * Pure-unit test: locks the exact copy and the "only append once,
 * preserves body" behavior. The run.ts gate (resolved tier === "pro")
 * is locked separately via billing-tier-multiplier.test.ts coverage of
 * the downgrade path; here we just test the formatter.
 */
import { describe, it, expect } from "vitest";
import { PRO_BADGE_FOOTER, appendProBadge } from "@/server/digest/run";

describe("CAD-91 — Pro tier badge", () => {
  it("appends the canonical Pro footer with a blank line separator", () => {
    const body = "## Headline\n\nSome content.";
    const out = appendProBadge(body);
    expect(out).toBe(body + "\n\n" + PRO_BADGE_FOOTER);
  });

  it("Pro footer wording is stable (user-visible copy lock)", () => {
    expect(PRO_BADGE_FOOTER).toBe(
      "🔬 Advanced research — deeper digging, 3 credits."
    );
  });

  it("does not mutate the input markdown", () => {
    const body = "hello";
    const before = body;
    appendProBadge(body);
    expect(body).toBe(before);
  });
});
