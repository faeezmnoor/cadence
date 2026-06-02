/**
 * T-415 / CAD-75: spec sidebar row builder + readiness predicate.
 *
 * Tests the pure helpers — no React. We don't mount the component (the
 * project doesn't run jsdom in vitest), we just verify the projection
 * from DigestSpecDraft jsonb to the display rows is correct.
 */
import { describe, expect, it } from "vitest";
import {
  buildRows as _buildRowsForTest,
  isReady as _isReadyForTest,
} from "@/components/chat/spec-sidebar.helpers";

describe("spec sidebar: buildRows", () => {
  it("renders all '— not set' fields for a null draft", () => {
    const rows = _buildRowsForTest(null);
    expect(rows.map((r) => r.label)).toEqual([
      "Topic",
      "Specificity",
      "Cadence",
      "Delivery time",
      "Channel",
      "Language",
    ]);
    // Channel is the only field that is always set (Telegram-only MVP).
    const channel = rows.find((r) => r.label === "Channel");
    expect(channel?.value).toBe("Telegram");
    expect(rows.find((r) => r.label === "Topic")?.value).toBeNull();
  });

  it("renders Mon-Fri cadence as 'weekdays'", () => {
    const rows = _buildRowsForTest({
      topics: ["palm oil"],
      cadence: {
        frequency: "daily",
        delivery_time_local: "07:30",
        days_of_week: [1, 2, 3, 4, 5],
      },
      language: "ms",
    });
    expect(rows.find((r) => r.label === "Cadence")?.value).toBe(
      "daily · weekdays"
    );
    expect(rows.find((r) => r.label === "Delivery time")?.value).toBe("07:30");
    expect(rows.find((r) => r.label === "Language")?.value).toBe(
      "Bahasa Malaysia"
    );
  });

  it("renders all 7 days as 'every day'", () => {
    const rows = _buildRowsForTest({
      cadence: {
        frequency: "daily",
        days_of_week: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    expect(rows.find((r) => r.label === "Cadence")?.value).toBe(
      "daily · every day"
    );
  });

  it("joins companies + tickers + keywords for specificity", () => {
    const rows = _buildRowsForTest({
      entities: { companies: ["Sime Darby"], tickers: ["SDP.KL", "IOIB.KL"] },
      keywords_include: ["EUDR"],
    });
    const sp = rows.find((r) => r.label === "Specificity")?.value;
    expect(sp).toContain("Sime Darby");
    expect(sp).toContain("SDP.KL");
    expect(sp).toContain("EUDR");
  });
});

describe("spec sidebar: isReady", () => {
  it("is false for null", () => {
    expect(_isReadyForTest(null)).toBe(false);
  });

  it("is false when topics missing", () => {
    expect(
      _isReadyForTest({
        cadence: { frequency: "daily", delivery_time_local: "08:00" },
        language: "en",
      })
    ).toBe(false);
  });

  it("is true when topics, cadence (freq+time), and language are all set", () => {
    expect(
      _isReadyForTest({
        topics: ["palm oil"],
        cadence: { frequency: "daily", delivery_time_local: "08:00" },
        language: "en",
      })
    ).toBe(true);
  });
});
