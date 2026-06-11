/**
 * CAD-97 — provider timeout tuning.
 *
 * Pins the per-request timeouts on the two Pro-tier providers so a
 * well-meaning future edit can't quietly tighten them back to a value
 * that trips legitimate slow-tail requests:
 *
 *   - Perplexity Sonar Reasoning Pro: 120s. Was 30s, then 45s — both
 *     tripped legitimate research calls (the CAD-222 bake-off measured
 *     4/5 specs timing out at 45s).
 *   - Anthropic Sonnet 4.6 Pro composer: 60s. The AI SDK has no implicit
 *     timeout — without this, a stuck connection blocks the Inngest
 *     worker until the function-level timeout fires.
 *
 * Why a separate test file vs piggybacking on providers-perplexity.test.ts:
 * the contract being asserted ("these values are stable, don't lower
 * them") is cross-provider and tied to CAD-97 specifically — keeping it
 * isolated makes the intent obvious if the assertion fails.
 */
import { describe, it, expect } from "vitest";
import { REQUEST_TIMEOUT_MS as PERPLEXITY_TIMEOUT_MS } from "@/server/ai/providers/perplexity";
import { PRO_COMPOSER_TIMEOUT_MS } from "@/server/ai/providers/anthropic-pro";

describe("CAD-97 provider timeout tuning", () => {
  it("Perplexity Sonar Reasoning Pro uses a 120s request timeout", () => {
    // Was 30s, then 45s — both tripped legitimate calls. The CAD-222
    // bake-off (2026-06-11) measured the real slow tail at 60–120s:
    // research happens INSIDE the call, same rationale as the websearch
    // composer's 120s. Beyond that it's a stuck connection.
    expect(PERPLEXITY_TIMEOUT_MS).toBe(120_000);
  });

  it("Anthropic Sonnet 4.6 Pro composer uses a 60s request timeout", () => {
    // Sonnet on a long sources bundle + the deeper Pro prompt routinely
    // takes 30–45s. 60s = "long but legitimate" headroom; anything beyond
    // that is almost certainly a stuck connection.
    expect(PRO_COMPOSER_TIMEOUT_MS).toBe(60_000);
  });

  it("timeouts are bounded — neither provider can hang indefinitely", () => {
    // Sanity: must be a positive finite number under the Inngest step
    // ceiling (default 5 min per step). If either exceeds that, the
    // function-level timeout would always win and our explicit timeout
    // would be dead code.
    expect(Number.isFinite(PERPLEXITY_TIMEOUT_MS)).toBe(true);
    expect(Number.isFinite(PRO_COMPOSER_TIMEOUT_MS)).toBe(true);
    expect(PERPLEXITY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PRO_COMPOSER_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PERPLEXITY_TIMEOUT_MS).toBeLessThan(5 * 60_000);
    expect(PRO_COMPOSER_TIMEOUT_MS).toBeLessThan(5 * 60_000);
  });
});
