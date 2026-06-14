/**
 * Manage-mode wave, ACX.1 (CTO-flagged isolated commit) — chat-turn cost
 * pricing pin.
 *
 * Locks openaiCostUsd's gpt-4o-mini table + the under-counting-is-worse
 * fallback so a refactor can't silently zero the new chat-turn cost_events
 * rows (they double as the RC7 transcript-cap monitoring signal).
 */
import { describe, expect, it } from "vitest";
import { openaiCostUsd } from "@/server/cost/record";

describe("openaiCostUsd — gpt-4o-mini pricing pin", () => {
  it("prices input at $0.15/1M and output at $0.60/1M", () => {
    expect(openaiCostUsd("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15, 10);
    expect(openaiCostUsd("gpt-4o-mini", 0, 1_000_000)).toBeCloseTo(0.6, 10);
    // A typical config-agent turn: ~2k in / ~150 out ≈ $0.00039.
    expect(openaiCostUsd("gpt-4o-mini", 2_000, 150)).toBeCloseTo(0.00039, 8);
  });

  it("zero usage costs zero", () => {
    expect(openaiCostUsd("gpt-4o-mini", 0, 0)).toBe(0);
  });

  it("unknown models fall back to gpt-4o-mini pricing, never 0", () => {
    expect(openaiCostUsd("gpt-5o-maxi", 1_000_000, 1_000_000)).toBeCloseTo(
      0.75,
      10
    );
  });
});
