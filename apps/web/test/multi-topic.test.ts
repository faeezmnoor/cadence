import { describe, it, expect } from "vitest";
import { detectMultiTopic } from "@/lib/chat/multi-topic";

describe("detectMultiTopic", () => {
  it("returns false for short or empty input", () => {
    expect(detectMultiTopic("").multiTopic).toBe(false);
    expect(detectMultiTopic("hi").multiTopic).toBe(false);
  });

  it("does not flag a single industry", () => {
    expect(detectMultiTopic("palm oil").multiTopic).toBe(false);
    expect(detectMultiTopic("I want palm oil daily").multiTopic).toBe(false);
  });

  it("does not flag a single industry with one qualifier", () => {
    // 2 candidates only — likely one industry, not enumeration.
    expect(detectMultiTopic("palm oil and EUDR").multiTopic).toBe(false);
    expect(detectMultiTopic("S&P 500 plus my watchlist").multiTopic).toBe(
      false
    );
  });

  it("flags 3 topics joined by 'and'", () => {
    const r = detectMultiTopic("TikTok Live and Shopee Live and crypto");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates).toContain("TikTok Live");
    expect(r.candidates).toContain("Shopee Live");
    expect(r.candidates).toContain("crypto");
  });

  it("flags comma-separated topic lists", () => {
    const r = detectMultiTopic("palm oil, EV batteries, semiconductors");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("strips leading filler before splitting", () => {
    const r = detectMultiTopic(
      "I want crypto, AI startups, and KL property"
    );
    expect(r.multiTopic).toBe(true);
    expect(r.candidates.some((c) => /crypto/i.test(c))).toBe(true);
  });

  it("ignores long conversational messages", () => {
    const long =
      "Hello, I'm a plantation trader based in KL and I'd really like a daily brief on the palm oil supply chain, especially focused on EU EUDR and Felda, because my desk covers upstream and downstream and we trade futures every morning.";
    expect(detectMultiTopic(long).multiTopic).toBe(false);
  });

  it("caps candidate chips at 4", () => {
    const r = detectMultiTopic("crypto, AI, palm oil, EVs, semiconductors");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates.length).toBeLessThanOrEqual(4);
  });

  it("flags 3 topics joined by '+' (QA P1 #4)", () => {
    const r = detectMultiTopic("TikTok Shop + Shopee Live + Klaviyo");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates).toContain("TikTok Shop");
    expect(r.candidates).toContain("Shopee Live");
    expect(r.candidates).toContain("Klaviyo");
  });

  it("flags 3 topics joined by '&'", () => {
    const r = detectMultiTopic("crypto & AI & palm oil");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("flags mixed-separator enumerations including '+'", () => {
    const r = detectMultiTopic("crypto + AI, palm oil and EVs");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("de-duplicates candidates case-insensitively", () => {
    const r = detectMultiTopic("Crypto, crypto and CRYPTO and AI");
    // After dedup we drop to fewer than 3 distinct candidates and the
    // signal collapses.
    expect(r.multiTopic).toBe(false);
  });
});
