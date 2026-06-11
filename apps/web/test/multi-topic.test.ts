import { describe, it, expect } from "vitest";
import {
  detectMultiTopic,
  detectMultiTopicIntake,
  MULTI_TOPIC_REFUSAL,
} from "@/lib/chat/multi-topic";

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

  it("returns every candidate from a 5-item list — no silent truncation", () => {
    // Dogfood 2026-06-11: the old cap-at-4 dropped the 5th item of the
    // user's own list with no indication. Refusal chips echo the user's
    // words back, so all of them must survive.
    const r = detectMultiTopic("crypto, AI, palm oil, EVs, semiconductors");
    expect(r.multiTopic).toBe(true);
    expect(r.candidates).toHaveLength(5);
    expect(r.candidates).toContain("semiconductors");
  });

  it("sanity-bounds candidates at 6", () => {
    const r = detectMultiTopic(
      "crypto, AI, palm oil, EVs, semis, steel, copper, gold"
    );
    expect(r.multiTopic).toBe(true);
    expect(r.candidates.length).toBeLessThanOrEqual(6);
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

describe("detectMultiTopicIntake (conversation-position gate)", () => {
  // Production repro, dogfood 2026-06-11: agent asked "Who should I
  // watch? Name 2-5 companies." and the user's answer was refused as
  // multi-topic, with their own words echoed back as chips.
  const COMPETITOR_ANSWER =
    "respond.io, meetcaire, 360dialog, omnichat, sleekflow";

  it("does NOT intercept a list answer mid-conversation (prod repro)", () => {
    const r = detectMultiTopicIntake(COMPETITOR_ANSWER, 1);
    expect(r.multiTopic).toBe(false);
    expect(r.candidates).toEqual([]);
  });

  it("does not intercept at any later turn either", () => {
    expect(detectMultiTopicIntake(COMPETITOR_ANSWER, 2).multiTopic).toBe(
      false
    );
    expect(
      detectMultiTopicIntake("crypto, AI, palm oil", 5).multiTopic
    ).toBe(false);
  });

  it("still intercepts the same list as the FIRST user message", () => {
    // Consistency over cleverness: a bare 5-item enumeration as the
    // opening message is genuine ambiguity — refuse and let them pick.
    const r = detectMultiTopicIntake(COMPETITOR_ANSWER, 0);
    expect(r.multiTopic).toBe(true);
    expect(r.candidates).toHaveLength(5);
    expect(r.candidates).toContain("sleekflow");
  });

  it("still catches genuine intake scope-creep with all candidates", () => {
    const r = detectMultiTopicIntake(
      "TikTok Live and Shopee Live and crypto",
      0
    );
    expect(r.multiTopic).toBe(true);
    expect(r.candidates).toHaveLength(3);
  });
});

describe("MULTI_TOPIC_REFUSAL copy", () => {
  it("matches the canonical COPY_GUIDE-trimmed string on every surface", () => {
    // Client render, server 422 body, and persisted assistant row all
    // import this constant — locking the string here locks all three.
    expect(MULTI_TOPIC_REFUSAL).toBe(
      "One topic per brief works best — which one first?"
    );
  });
});
