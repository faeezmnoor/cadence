/**
 * Unit tests for the chat timestamp formatter.
 *
 * Locked rules from blueprint/chat-ux-parity-v1.md §2.2.
 */
import { describe, expect, it } from "vitest";
import {
  crossesDayBoundary,
  formatChatTime,
  formatDateSeparator,
} from "@/lib/chat/format-time";

// Reference "now" — Tuesday 2026-06-09 16:08 local time. Tests use the
// system local timezone (the CI runner's tz), which is fine because the
// formatter itself operates on the user's local clock.
const NOW = new Date(2026, 5, 9, 16, 8, 0); // Jun=5 (0-indexed)

describe("formatChatTime", () => {
  it("returns 'just now' under 60s", () => {
    expect(formatChatTime(new Date(NOW.getTime() - 5_000), NOW)).toBe("just now");
  });

  it("returns 'Nm ago' within the hour", () => {
    expect(formatChatTime(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe(
      "5m ago"
    );
  });

  it("returns clock time for earlier today", () => {
    const at = new Date(2026, 5, 9, 8, 13);
    expect(formatChatTime(at, NOW)).toBe("8:13 AM");
  });

  it("returns 'Yesterday ...' for yesterday", () => {
    const at = new Date(2026, 5, 8, 14, 5);
    expect(formatChatTime(at, NOW)).toBe("Yesterday 2:05 PM");
  });

  it("returns short day name within the week", () => {
    // Three days back from Tuesday Jun 9 is Saturday Jun 6.
    const at = new Date(2026, 5, 6, 9, 0);
    expect(formatChatTime(at, NOW)).toBe("Sat 9:00 AM");
  });

  it("returns 'MMM D, h:mm AM/PM' earlier in same year", () => {
    const at = new Date(2026, 0, 15, 10, 30);
    expect(formatChatTime(at, NOW)).toBe("Jan 15, 10:30 AM");
  });

  it("returns 'MMM D YYYY, h:mm AM/PM' for prior years", () => {
    const at = new Date(2025, 5, 8, 8, 13);
    expect(formatChatTime(at, NOW)).toBe("Jun 8 2025, 8:13 AM");
  });
});

describe("formatDateSeparator", () => {
  it("labels today", () => {
    expect(formatDateSeparator(new Date(2026, 5, 9, 1, 0), NOW)).toBe("Today");
  });
  it("labels yesterday", () => {
    expect(formatDateSeparator(new Date(2026, 5, 8, 1, 0), NOW)).toBe(
      "Yesterday"
    );
  });
  it("labels weekday within the week", () => {
    expect(formatDateSeparator(new Date(2026, 5, 6, 1, 0), NOW)).toBe(
      "Saturday"
    );
  });
  it("labels month + day earlier in year", () => {
    expect(formatDateSeparator(new Date(2026, 0, 15, 1, 0), NOW)).toBe("Jan 15");
  });
  it("labels month + day + year for prior years", () => {
    expect(formatDateSeparator(new Date(2025, 0, 15, 1, 0), NOW)).toBe(
      "Jan 15, 2025"
    );
  });
});

describe("crossesDayBoundary", () => {
  it("returns false within same local day", () => {
    expect(
      crossesDayBoundary(
        new Date(2026, 5, 9, 1, 0),
        new Date(2026, 5, 9, 23, 0)
      )
    ).toBe(false);
  });
  it("returns true across local day boundary", () => {
    expect(
      crossesDayBoundary(
        new Date(2026, 5, 9, 23, 0),
        new Date(2026, 5, 10, 0, 30)
      )
    ).toBe(true);
  });
});
