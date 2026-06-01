/**
 * Adversarial coverage for the Telegram splitter (T-209).
 *
 * The invariant that ships the product: every output part is <= 4096 chars,
 * because Telegram's sendMessage rejects anything longer.
 */
import { describe, expect, it } from "vitest";
import {
  splitForTelegram,
  formatComposerOutput,
  TELEGRAM_HARD_CAP,
  CADENCE_PART_CAP,
} from "../server/telegram/format";

const allUnderHardCap = (parts: string[]) =>
  parts.every((p) => p.length <= TELEGRAM_HARD_CAP);

describe("splitForTelegram", () => {
  it("empty input returns []", () => {
    expect(splitForTelegram("")).toEqual([]);
  });

  it("single char", () => {
    expect(splitForTelegram("x")).toEqual(["x"]);
  });

  it("exact CADENCE_PART_CAP returns one part", () => {
    const s = "a".repeat(CADENCE_PART_CAP);
    const out = splitForTelegram(s);
    expect(out.length).toBe(1);
    expect(out[0].length).toBe(CADENCE_PART_CAP);
  });

  it("CADENCE_PART_CAP+1 always splits and stays under hard cap", () => {
    const s = "a".repeat(CADENCE_PART_CAP + 1);
    const out = splitForTelegram(s);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(allUnderHardCap(out)).toBe(true);
  });

  it("50k chars without whitespace still splits under hard cap", () => {
    const s = "a".repeat(50_000);
    const out = splitForTelegram(s);
    expect(out.length).toBeGreaterThan(1);
    expect(allUnderHardCap(out)).toBe(true);
  });

  it("50k chars of prose splits under hard cap", () => {
    const s = ("paragraph text. ".repeat(50) + "\n\n").repeat(200);
    const out = splitForTelegram(s);
    expect(allUnderHardCap(out)).toBe(true);
  });

  it("unclosed code fence does not blow out the cap", () => {
    const s = "before\n```\n" + "x".repeat(5000);
    const out = splitForTelegram(s);
    expect(allUnderHardCap(out)).toBe(true);
  });

  it("unterminated link does not blow out the cap", () => {
    const s = "before [a label " + "x".repeat(5000);
    const out = splitForTelegram(s);
    expect(allUnderHardCap(out)).toBe(true);
  });

  it("deeply nested links stay under cap", () => {
    const s = "[a](http://x) ".repeat(5000);
    const out = splitForTelegram(s);
    expect(allUnderHardCap(out)).toBe(true);
  });

  it("only-newlines collapses cleanly", () => {
    const s = "\n".repeat(5000);
    const out = splitForTelegram(s);
    expect(allUnderHardCap(out)).toBe(true);
  });
});

describe("formatComposerOutput", () => {
  it("runaway 50k-char composer output gets split safely", () => {
    const parts = formatComposerOutput("a".repeat(50_000));
    expect(parts.every((p) => p.text.length <= TELEGRAM_HARD_CAP)).toBe(true);
    expect(parts.every((p) => p.parseMode === "Markdown")).toBe(true);
  });

  it("empty composer output returns no parts", () => {
    expect(formatComposerOutput("")).toEqual([]);
  });
});
