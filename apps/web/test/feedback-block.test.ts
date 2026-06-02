import { describe, it, expect } from "vitest";
import {
  buildFeedbackBlock,
  approxTokens,
  FEEDBACK_BLOCK_TOKEN_CAP,
} from "@/server/ai/composer/feedback-block";

function row(id: string, rawText: string, isoDate: string) {
  return { id, rawText, createdAt: new Date(isoDate) };
}

describe("feedback-block builder (T-404)", () => {
  it("returns empty arrays when neither signal present", () => {
    const out = buildFeedbackBlock({ distilledPrefs: null, rawCandidates: [] });
    expect(out.distilledPrefs).toEqual([]);
    expect(out.recentRawNotes).toEqual([]);
    expect(out.consumedRawIds).toEqual([]);
    expect(out.approxTokensUsed).toBe(0);
  });

  it("includes distilled prefs verbatim when only those exist", () => {
    const out = buildFeedbackBlock({
      distilledPrefs: ["prefers tables", "no crypto"],
      rawCandidates: [],
    });
    expect(out.distilledPrefs).toEqual(["prefers tables", "no crypto"]);
    expect(out.recentRawNotes).toEqual([]);
    expect(out.consumedRawIds).toEqual([]);
  });

  it("formats raw notes with date prefix newest-first and marks them consumed", () => {
    const out = buildFeedbackBlock({
      distilledPrefs: null,
      rawCandidates: [
        row("a", "more on TikTok Shop EU", "2026-06-02T10:00:00Z"),
        row("b", "less crypto", "2026-06-01T10:00:00Z"),
      ],
    });
    expect(out.recentRawNotes).toEqual([
      "2026-06-02: more on TikTok Shop EU",
      "2026-06-01: less crypto",
    ]);
    expect(out.consumedRawIds).toEqual(["a", "b"]);
  });

  it("combines distilled + raw signals", () => {
    const out = buildFeedbackBlock({
      distilledPrefs: ["prefers tables"],
      rawCandidates: [row("a", "more on EU", "2026-06-02T10:00:00Z")],
    });
    expect(out.distilledPrefs).toEqual(["prefers tables"]);
    expect(out.recentRawNotes).toEqual(["2026-06-02: more on EU"]);
    expect(out.consumedRawIds).toEqual(["a"]);
  });

  it("honors the 500-token cap — only top-N raw rows fit", () => {
    // ~80 chars per row -> ~20 tokens. Default cap 500. Should fit ~24-ish.
    const rows = Array.from({ length: 50 }, (_, i) =>
      row(
        `id-${i}`,
        // Pad rawText to make each row meaningfully sized.
        `signal number ${i} ` + "x".repeat(60),
        `2026-06-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`
      )
    );
    const out = buildFeedbackBlock({ distilledPrefs: null, rawCandidates: rows });
    expect(out.recentRawNotes.length).toBeGreaterThan(0);
    expect(out.recentRawNotes.length).toBeLessThan(50);
    expect(out.approxTokensUsed).toBeLessThanOrEqual(FEEDBACK_BLOCK_TOKEN_CAP);
    expect(out.consumedRawIds.length).toBe(out.recentRawNotes.length);
  });

  it("respects custom tokenCap and stops accumulating mid-list", () => {
    const out = buildFeedbackBlock({
      distilledPrefs: null,
      rawCandidates: [
        row("a", "a".repeat(200), "2026-06-02T10:00:00Z"),
        row("b", "b".repeat(200), "2026-06-01T10:00:00Z"),
        row("c", "c".repeat(200), "2026-05-31T10:00:00Z"),
      ],
      tokenCap: 60, // ~240 chars budget
    });
    expect(out.recentRawNotes.length).toBeLessThan(3);
    expect(out.consumedRawIds).toEqual(out.recentRawNotes.map((_, i) =>
      ["a", "b", "c"][i]
    ));
  });

  it("prioritizes distilled bullets over raw rows when budget is tight", () => {
    const out = buildFeedbackBlock({
      distilledPrefs: ["one", "two"],
      rawCandidates: [row("a", "x".repeat(400), "2026-06-02T10:00:00Z")],
      tokenCap: 10, // tiny — only one short distilled bullet fits
    });
    expect(out.distilledPrefs.length).toBeGreaterThan(0);
    expect(out.recentRawNotes).toEqual([]);
    expect(out.consumedRawIds).toEqual([]);
  });

  it("skips whitespace-only raw rows defensively", () => {
    const out = buildFeedbackBlock({
      distilledPrefs: null,
      rawCandidates: [
        row("a", "   ", "2026-06-02T10:00:00Z"),
        row("b", "real signal", "2026-06-01T10:00:00Z"),
      ],
    });
    expect(out.consumedRawIds).toEqual(["b"]);
    expect(out.recentRawNotes).toEqual(["2026-06-01: real signal"]);
  });

  it("approxTokens uses length/4 ceiling", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });
});
