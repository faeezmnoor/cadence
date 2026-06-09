/**
 * Wave 5 Bug 15 — every Telegram sendMessage callsite that handles a
 * variable-length payload MUST route through splitForTelegram. Otherwise
 * long messages get rejected with 400 "MESSAGE_TOO_LONG" at the >4096-char
 * boundary (or worse, silently truncated by some clients).
 *
 * Callsites covered:
 *   - server/inngest/functions/smoke-summary.ts (daily smoke summary)
 *   - server/telegram/dispatch.ts safeSend (callback-flow nudges)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitForTelegram, CADENCE_PART_CAP } from "@/server/telegram/format";

const ROOT = resolve(__dirname, "..");
function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("Wave 5 Bug 15 — Telegram sendMessage callsites route through splitter", () => {
  it("server/inngest/functions/smoke-summary.ts uses splitForTelegram", () => {
    const src = readSrc("server/inngest/functions/smoke-summary.ts");
    expect(src).toMatch(/import\s*{[^}]*splitForTelegram[^}]*}\s*from\s*"@\/server\/telegram\/format"/);
    expect(src).toMatch(/splitForTelegram\s*\(/);
  });

  it("server/telegram/dispatch.ts safeSend uses splitForTelegram", () => {
    const src = readSrc("server/telegram/dispatch.ts");
    expect(src).toMatch(/import\s*{[^}]*splitForTelegram[^}]*}\s*from\s*"\.\/format"/);
    const safeSendBlock = src.split("async function safeSend(")[1] ?? "";
    expect(safeSendBlock).toMatch(/splitForTelegram\s*\(/);
  });

  it("splitForTelegram caps parts at CADENCE_PART_CAP", () => {
    const long = "a".repeat(CADENCE_PART_CAP * 3 + 200);
    const parts = splitForTelegram(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(CADENCE_PART_CAP);
    }
  });
});
