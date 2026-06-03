/**
 * UX P0 #2 — Sample brief banner.
 *
 * Pure-unit test: locks the banner copy (user-visible, anchors expectation
 * for "what tomorrow looks like") and verifies the cadence-word switch.
 * The run.ts gate (`trigger === "sample"`) is what keeps scheduled briefs
 * banner-free — we do NOT call buildSampleBanner from the scheduled path,
 * so the unit test scope here is the pure builder.
 */
import { describe, it, expect } from "vitest";
import { buildSampleBanner } from "@/server/digest/sample-banner";

describe("UX P0 #2 — sample brief banner", () => {
  it("renders daily cadence with delivery time + timezone", () => {
    const out = buildSampleBanner({
      frequency: "daily",
      deliveryTimeLocal: "07:00",
      timezone: "Asia/Kuala_Lumpur",
    });
    expect(out).toContain("This is your SAMPLE brief");
    expect(out).toContain("every day at 07:00 (Asia/Kuala_Lumpur)");
    expect(out).toContain("👍");
    expect(out).toContain("👎");
    expect(out).toContain("/tune");
    // Two trailing newlines so the brief body starts cleanly.
    expect(out.endsWith("\n\n")).toBe(true);
  });

  it("switches cadence word for weekly + monthly", () => {
    const weekly = buildSampleBanner({
      frequency: "weekly",
      deliveryTimeLocal: "09:00",
      timezone: "Asia/Kuala_Lumpur",
    });
    expect(weekly).toContain("every week at 09:00");

    const monthly = buildSampleBanner({
      frequency: "monthly",
      deliveryTimeLocal: null,
      timezone: null,
    });
    expect(monthly).toContain("every month");
    // No bogus parenthetical when tz is null.
    expect(monthly).not.toContain("(");
  });

  it("degrades gracefully when delivery_time_local is missing", () => {
    const out = buildSampleBanner({
      frequency: "daily",
      deliveryTimeLocal: null,
      timezone: "Asia/Kuala_Lumpur",
    });
    // No " at " fragment when time is missing.
    expect(out).toContain("every day (Asia/Kuala_Lumpur)");
    expect(out).not.toMatch(/at\s+\(/);
  });
});
