/**
 * T-507a: low-balance Telegram footer copy tier selection + link rendering.
 */
import { describe, expect, it } from "vitest";
import {
  buildLowBalanceFooter,
  pickFooterTier,
  runwayDays,
} from "@/server/billing/low-balance-footer";

describe("T-507a — runway math", () => {
  it("daily cadence: balance N → N days", () => {
    expect(runwayDays(10, "daily")).toBe(10);
  });
  it("weekly cadence: balance 1 → 7 days", () => {
    expect(runwayDays(1, "weekly")).toBe(7);
  });
  it("monthly cadence: balance 1 → 30 days", () => {
    expect(runwayDays(1, "monthly")).toBe(30);
  });
  it("0 balance → 0 days regardless of cadence", () => {
    expect(runwayDays(0, "monthly")).toBe(0);
  });
});

describe("T-507a — tier selection (PRD §5.2)", () => {
  it("daily, balance 10 → none (>7d runway)", () => {
    expect(
      pickFooterTier({ creditsBalance: 10, cadence: "daily", trialActive: false })
    ).toBe("none");
  });
  it("daily, balance 7 → soft (≤7d)", () => {
    expect(
      pickFooterTier({ creditsBalance: 7, cadence: "daily", trialActive: false })
    ).toBe("soft");
  });
  it("daily, balance 3 → urgent (≤3d)", () => {
    expect(
      pickFooterTier({ creditsBalance: 3, cadence: "daily", trialActive: false })
    ).toBe("urgent");
  });
  it("daily, balance 0 → paywall (1-brief grace; this brief is the last)", () => {
    expect(
      pickFooterTier({ creditsBalance: 0, cadence: "daily", trialActive: false })
    ).toBe("paywall");
  });
  it("weekly, balance 1 → soft (1 credit = 7d runway, not urgent)", () => {
    expect(
      pickFooterTier({ creditsBalance: 1, cadence: "weekly", trialActive: false })
    ).toBe("soft");
  });

  it("trial user above urgent → trial_nudge (gentle pre-trial-end push)", () => {
    expect(
      pickFooterTier({ creditsBalance: 2, cadence: "weekly", trialActive: true })
    ).toBe("trial_nudge");
  });
  it("trial user at urgent → urgent (not trial_nudge — actual urgency wins)", () => {
    expect(
      pickFooterTier({ creditsBalance: 3, cadence: "daily", trialActive: true })
    ).toBe("urgent");
  });
  it("trial user at paywall → paywall wins over trial_nudge", () => {
    expect(
      pickFooterTier({ creditsBalance: 0, cadence: "daily", trialActive: true })
    ).toBe("paywall");
  });
});

describe("T-507a — footer rendering", () => {
  const APP = "https://cadence.example.com";

  it("none tier → null (no footer appended)", () => {
    expect(
      buildLowBalanceFooter({
        creditsBalance: 50,
        cadence: "daily",
        trialActive: false,
        appUrl: APP,
      })
    ).toBeNull();
  });

  it("paywall footer includes /settings/billing link", () => {
    const f = buildLowBalanceFooter({
      creditsBalance: 0,
      cadence: "daily",
      trialActive: false,
      appUrl: APP,
    });
    expect(f).toContain(`${APP}/settings/billing`);
    expect(f).toContain("last brief");
  });

  it("urgent footer includes day count and Top up link", () => {
    const f = buildLowBalanceFooter({
      creditsBalance: 2,
      cadence: "daily",
      trialActive: false,
      appUrl: APP,
    });
    expect(f).toContain("2 days of credits left");
    expect(f).toContain(`${APP}/settings/billing`);
  });

  it("soft footer uses singular 'day' for 1-day runway", () => {
    const f = buildLowBalanceFooter({
      creditsBalance: 1,
      cadence: "daily",
      trialActive: false,
      appUrl: APP,
    });
    // 1 credit @ daily = 1 day runway → urgent tier, singular phrasing
    expect(f).toMatch(/1 day of credits left/);
  });

  it("trims trailing slash on app URL", () => {
    const f = buildLowBalanceFooter({
      creditsBalance: 0,
      cadence: "daily",
      trialActive: false,
      appUrl: "https://x.com/",
    });
    expect(f).toContain("https://x.com/settings/billing");
    expect(f).not.toContain("//settings");
  });

  it("trial nudge mentions trial state", () => {
    const f = buildLowBalanceFooter({
      creditsBalance: 2,
      cadence: "weekly",
      trialActive: true,
      appUrl: APP,
    });
    expect(f).toMatch(/trial/i);
  });
});
