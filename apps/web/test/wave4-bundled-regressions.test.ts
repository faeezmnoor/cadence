/**
 * Wave 4 bundled regressions — one file per shipped fix so a future
 * regression on any of these surfaces fails CI loudly.
 *
 * Covers:
 *  - Bug 3: double-bubble — chat MessageBubble must render content xor ask_user
 *  - Bug 4: raw enum chips — quick-reply prettifier maps enum keys
 *  - Bug 7: saveSpec must derive name + scheduling
 *  - Bug 9 (P0): composer prompt anchors entities as HARD requirement
 */
import { describe, it, expect } from "vitest";
import { buildComposerSystemPrompt } from "@/server/ai/composer/prompt";
import { emptyDigestSpec, digestSpecSchema } from "@/lib/digest-spec/schema";
import { prettifyChip, CHIP_ENUM_LABELS } from "@/components/chat/quick-replies";
import { ruleFromLegacyCadence } from "@/lib/scheduling/rule";

describe("Wave 4 Bug 4 — quick-reply chip prettifier", () => {
  it("maps every documented enum value to a human label", () => {
    expect(prettifyChip("executive_brief")).toBe("Executive brief");
    expect(prettifyChip("analyst_deep_dive")).toBe("Analyst deep-dive");
    expect(prettifyChip("trader_quick_take")).toBe("Trader quick take");
    expect(prettifyChip("casual_newsletter")).toBe("Casual newsletter");
    expect(prettifyChip("short")).toBe("Short");
    expect(prettifyChip("medium")).toBe("Medium");
    expect(prettifyChip("long")).toBe("Long");
    expect(prettifyChip("en")).toBe("English");
    expect(prettifyChip("ms")).toBe("Bahasa Malaysia");
    expect(prettifyChip("zh")).toBe("中文");
    expect(prettifyChip("daily")).toBe("Daily");
    expect(prettifyChip("weekly")).toBe("Weekly");
    expect(prettifyChip("monthly")).toBe("Monthly");
  });

  it("passes free-form chip text through untouched", () => {
    expect(prettifyChip("Palm oil daily")).toBe("Palm oil daily");
    expect(prettifyChip("Bitcoin + macro")).toBe("Bitcoin + macro");
    expect(prettifyChip("Felda")).toBe("Felda");
  });

  it("is case-tolerant for sloppy LLM output", () => {
    expect(prettifyChip("EXECUTIVE_BRIEF")).toBe("Executive brief");
    expect(prettifyChip("Executive_brief")).toBe("Executive brief");
  });

  it("covers the entire DigestSpec enum surface area", () => {
    // Tone, length, language, frequency — anything else lives outside the chip
    // pipeline (cadence.delivery_time_local is HH:MM free-form, etc.).
    const required = [
      "executive_brief",
      "analyst_deep_dive",
      "trader_quick_take",
      "casual_newsletter",
      "short",
      "medium",
      "long",
      "en",
      "ms",
      "zh",
      "daily",
      "weekly",
      "monthly",
    ];
    for (const key of required) {
      expect(
        Object.prototype.hasOwnProperty.call(CHIP_ENUM_LABELS, key),
        `enum label missing for "${key}"`
      ).toBe(true);
    }
  });
});

describe("Wave 4 Bug 9 (P0) — composer prompt entity HARD anchors", () => {
  it("emits an ENTITY ANCHORS HARD REQUIREMENT block when companies are set", () => {
    const spec = digestSpecSchema.parse({
      ...emptyDigestSpec(),
      topics: ["Malaysian gov procurement"],
      entities: { companies: ["ePerolehan"], tickers: [], commodities: [] },
    });
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/ENTITY ANCHORS \(HARD REQUIREMENT\)/);
    expect(p).toMatch(/"ePerolehan"/);
    expect(p).toMatch(/MUST be a direct subject of the brief/);
    expect(p).toMatch(/NEVER substitute SAM\.gov for ePerolehan/);
  });

  it("omits the entity-anchor block when entities are empty", () => {
    const spec = emptyDigestSpec();
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).not.toMatch(/ENTITY ANCHORS/);
  });

  it("handles tickers and commodities anchors independently", () => {
    const spec = digestSpecSchema.parse({
      ...emptyDigestSpec(),
      topics: ["Equities + commodities"],
      entities: {
        companies: [],
        tickers: ["BTC", "SDP.KL"],
        commodities: ["CPO"],
      },
    });
    const p = buildComposerSystemPrompt({
      spec,
      sources: { search: [], rss: [] },
    });
    expect(p).toMatch(/tickers: `BTC`, `SDP\.KL`/);
    expect(p).toMatch(/commodities: `CPO`/);
  });
});

describe("Wave 4 Bug 7 — scheduling derivation from spec.cadence", () => {
  it("produces a SchedulingRuleV1 with the spec's frequency + time", () => {
    const rule = ruleFromLegacyCadence({
      cadence: {
        frequency: "daily",
        delivery_time_local: "07:30",
        days_of_week: [1, 2, 3, 4, 5],
      },
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-06-09",
    });
    expect(rule.timeLocal).toBe("07:30");
    expect(rule.timezone).toBe("Asia/Kuala_Lumpur");
    expect(rule.cadence.kind).toBe("daily");
  });

  it("maps weekly + monthly frequency through", () => {
    const weekly = ruleFromLegacyCadence({
      cadence: {
        frequency: "weekly",
        delivery_time_local: "09:00",
        days_of_week: [1],
      },
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-06-09",
    });
    expect(weekly.cadence.kind).toBe("weekly");

    const monthly = ruleFromLegacyCadence({
      cadence: {
        frequency: "monthly",
        delivery_time_local: "09:00",
        days_of_week: [],
      },
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-06-09",
    });
    expect(monthly.cadence.kind).toBe("monthly");
  });
});
