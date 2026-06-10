/**
 * Telegram-specific channel-adapter assertions (CAD-205).
 *
 * Pinned numeric expectations and pure-function contract tests for the
 * Telegram adapter. Shared invariants live in `invariants.spec.ts`.
 */
import { describe, expect, it } from "vitest";
import { telegramAdapter } from "@/server/channels/telegram";

describe("telegramAdapter", () => {
  it("channel id is 'telegram'", () => {
    expect(telegramAdapter.channel).toBe("telegram");
  });

  it("invariants pin Telegram's actual hard cap (4096)", () => {
    expect(telegramAdapter.invariants.hardCap).toBe(4096);
  });

  it("soft cap is below hard cap (composer headroom)", () => {
    expect(telegramAdapter.invariants.softCap).toBeLessThan(
      telegramAdapter.invariants.hardCap
    );
  });

  it("format() is pure — same input yields identical output across calls", () => {
    const brief = { markdown: "# Hello\n\nThis is a test brief." };
    const a = telegramAdapter.format(brief);
    const b = telegramAdapter.format(brief);
    expect(a).toEqual(b);
  });

  it("format() defaults to legacy Markdown parse mode", () => {
    const parts = telegramAdapter.format({ markdown: "**hello** _world_" });
    expect(parts.length).toBe(1);
    expect(parts[0].parseMode).toBe("Markdown");
  });

  it("partText() returns the text the user sees", () => {
    const parts = telegramAdapter.format({ markdown: "hello" });
    expect(telegramAdapter.partText(parts[0])).toBe("hello");
  });
});
