/**
 * Wave 5 Bug 15 (re-locked for CAD-207) — every Telegram callsite that
 * handles a variable-length payload MUST route through the channel
 * adapter, whose formatters split at the part cap. Otherwise long
 * messages get rejected with 400 "MESSAGE_TOO_LONG" at the >4096-char
 * boundary (or worse, silently truncated by some clients).
 *
 * Callsites covered:
 *   - server/inngest/functions/smoke-summary.ts (daily smoke summary)
 *   - server/channels/telegram/inbound/dispatch.ts safeSend (callback-flow nudges)
 *
 * The "no raw bot.api.sendMessage outside the adapter" rule itself is
 * enforced by ESLint (no-restricted-syntax, CAD-207) — this test locks
 * the splitter routing, which lint can't see.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  splitForTelegram,
  formatPlainText,
} from "@/server/channels/telegram";
import { CADENCE_PART_CAP } from "@/server/channels/telegram/format";

const ROOT = resolve(__dirname, "..");
function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("Wave 5 Bug 15 — Telegram sendMessage callsites route through splitter", () => {
  it("server/inngest/functions/smoke-summary.ts sends via the adapter's plain-text formatter", () => {
    const src = readSrc("server/inngest/functions/smoke-summary.ts");
    expect(src).toMatch(
      /import\s*{[^}]*formatPlainText[^}]*}\s*from\s*"@\/server\/channels\/telegram"/
    );
    expect(src).toMatch(/formatPlainText\s*\(/);
    expect(src).toMatch(/telegramAdapter\.send\s*\(/);
    expect(src).not.toMatch(/\.api\.sendMessage\s*\(/);
  });

  it("server/channels/telegram/inbound/dispatch.ts safeSend sends via the adapter's plain-text formatter", () => {
    const src = readSrc("server/channels/telegram/inbound/dispatch.ts");
    expect(src).toMatch(
      /import\s*{[^}]*formatPlainText[^}]*}\s*from\s*"\.\.\/index"/
    );
    const safeSendBlock = src.split("async function safeSend(")[1] ?? "";
    expect(safeSendBlock).toMatch(/formatPlainText\s*\(/);
    expect(safeSendBlock).toMatch(/telegramAdapter\.send\s*\(/);
  });

  it("splitForTelegram caps parts at CADENCE_PART_CAP", () => {
    const long = "a".repeat(CADENCE_PART_CAP * 3 + 200);
    const parts = splitForTelegram(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(CADENCE_PART_CAP);
    }
  });

  it("formatPlainText splits at the cap and attaches no parse mode", () => {
    const long = "b".repeat(CADENCE_PART_CAP * 2 + 100);
    const parts = formatPlainText(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.text.length).toBeLessThanOrEqual(CADENCE_PART_CAP);
      expect(p.parseMode).toBeUndefined();
    }
  });
});
