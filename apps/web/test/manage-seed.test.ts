/**
 * Brief manage mode — buildManageSeedSummary (plan §3.6 / §4.2, AC7.2).
 *
 * The lazy-created manage thread's two deterministic seed bubbles. Locked
 * here:
 *   - exact copy shape per §3.6 (final-candidate COPY)
 *   - schedule text routes through the lifted humanizeSchedule — never raw
 *     cron/snake_case (ACX.3), embedded lowercase for cadence openers only
 *   - BANNED-VOCAB assertion across fixture specs (ACX.4, enforced by test,
 *     not convention): no "digest", "spec", "config", "manage mode",
 *     "thread", "session"
 */
import { describe, expect, it } from "vitest";
import {
  buildManageSeedSummary,
  embedScheduleLabel,
  joinTopicsPlain,
} from "@/server/chat/manage-seed";

const DAILY_RULE = {
  version: 1,
  startDate: "2026-06-01",
  endDate: null,
  timeLocal: "07:00",
  timezone: "Asia/Kuala_Lumpur",
  cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] },
  skipDates: [],
  skipWhen: {},
};

const WEEKLY_RULE = {
  ...DAILY_RULE,
  timeLocal: "08:30",
  cadence: { kind: "weekly", weekdays: [1, 4] },
};

// COPY_GUIDE-compliant fixture domains: commodities, regulation, competitors.
const FIXTURE_SPECS: Array<{ spec: unknown; scheduling: unknown }> = [
  { spec: { topics: ["palm oil supply chain"] }, scheduling: DAILY_RULE },
  {
    spec: { topics: ["EU deforestation regulation", "CPO futures"] },
    scheduling: WEEKLY_RULE,
  },
  {
    spec: { topics: ["competitor launches", "poultry feed costs", "MYR/USD"] },
    scheduling: { ...DAILY_RULE, cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5] } },
  },
  // Degenerate rows lazy-create can meet in the wild: empty topics,
  // unset scheduling jsonb ('{}'), malformed spec.
  { spec: { topics: [] }, scheduling: {} },
  { spec: null, scheduling: DAILY_RULE },
];

const BANNED = ["digest", "spec", "config", "manage mode", "thread", "session"];

describe("buildManageSeedSummary", () => {
  it("returns exactly two bubbles with the §3.6 copy shape", () => {
    const [b1, b2] = buildManageSeedSummary(FIXTURE_SPECS[0]!);
    expect(b1).toBe(
      "Here's your brief: palm oil supply chain, daily at 07:00 (Asia/Kuala_Lumpur)."
    );
    expect(b2).toBe("Ask me for a sample, or tell me what to change.");
  });

  it("plain-joins multiple topics with the Oxford comma", () => {
    const [b1] = buildManageSeedSummary(FIXTURE_SPECS[2]!);
    expect(b1).toBe(
      "Here's your brief: competitor launches, poultry feed costs, and MYR/USD, weekdays at 07:00 (Asia/Kuala_Lumpur)."
    );
  });

  it("weekly schedules keep their day names via humanizeSchedule", () => {
    const [b1] = buildManageSeedSummary(FIXTURE_SPECS[1]!);
    expect(b1).toContain("weekly · Mon, Thu at 08:30 (Asia/Kuala_Lumpur)");
  });

  it("degrades gracefully when topics are empty or the spec is malformed", () => {
    const [emptyTopics] = buildManageSeedSummary(FIXTURE_SPECS[3]!);
    expect(emptyTopics).toBe("Here's your brief — schedule not set.");
    const [nullSpec] = buildManageSeedSummary(FIXTURE_SPECS[4]!);
    expect(nullSpec).toBe(
      "Here's your brief — daily at 07:00 (Asia/Kuala_Lumpur)."
    );
  });

  it("BANNED VOCAB: never says digest/spec/config/manage mode/thread/session (ACX.4)", () => {
    for (const fixture of FIXTURE_SPECS) {
      for (const bubble of buildManageSeedSummary(fixture)) {
        const lower = bubble.toLowerCase();
        for (const word of BANNED) {
          expect(lower, `"${bubble}" must not contain "${word}"`).not.toContain(
            word
          );
        }
      }
    }
  });

  it("never leaks raw cron or snake_case schedule internals (ACX.3)", () => {
    const [b1] = buildManageSeedSummary({
      spec: { topics: ["palm oil"] },
      scheduling: DAILY_RULE,
    });
    expect(b1).not.toMatch(/delivery_time_local|days_of_week|timeLocal/);
  });
});

describe("embedScheduleLabel", () => {
  it("lowercases known cadence openers for mid-sentence flow", () => {
    expect(embedScheduleLabel("Daily at 07:00")).toBe("daily at 07:00");
    expect(embedScheduleLabel("Weekdays at 08:00")).toBe("weekdays at 08:00");
    expect(embedScheduleLabel("Monthly on day 1 at 09:00")).toBe(
      "monthly on day 1 at 09:00"
    );
    expect(embedScheduleLabel("Schedule not set")).toBe("schedule not set");
  });

  it("preserves day-name-first labels (proper nouns stay capitalized)", () => {
    expect(embedScheduleLabel("Mon, Wed at 08:00")).toBe("Mon, Wed at 08:00");
  });
});

describe("joinTopicsPlain", () => {
  it("joins 1 / 2 / 3+ topics per COPY_GUIDE mechanics", () => {
    expect(joinTopicsPlain(["a"])).toBe("a");
    expect(joinTopicsPlain(["a", "b"])).toBe("a and b");
    expect(joinTopicsPlain(["a", "b", "c"])).toBe("a, b, and c");
    expect(joinTopicsPlain([])).toBe("");
    expect(joinTopicsPlain(["  ", "a"])).toBe("a");
  });
});
