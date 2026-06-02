/**
 * Stream E #6 — brief share helper. Pure-function tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateBriefShortId,
  getBriefShareUrl,
  isValidShortId,
  SHORT_ID_RE,
} from "@/server/digest/share";

describe("Stream E #6 — generateBriefShortId", () => {
  it("produces a 12-char string", () => {
    const id = generateBriefShortId();
    expect(id).toHaveLength(12);
  });

  it("uses only alphanumeric characters", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateBriefShortId()).toMatch(SHORT_ID_RE);
    }
  });

  it("does not collide in 1000 draws", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateBriefShortId());
    expect(ids.size).toBe(1000);
  });
});

describe("Stream E #6 — isValidShortId", () => {
  it("accepts a valid 12-char alphanumeric id", () => {
    expect(isValidShortId("aB3deFGhi9Jk")).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(isValidShortId("short")).toBe(false);
    expect(isValidShortId("a".repeat(13))).toBe(false);
  });
  it("rejects symbols", () => {
    expect(isValidShortId("aB3deFGh-iJk")).toBe(false);
    expect(isValidShortId("aB3deFGh.iJk")).toBe(false);
    expect(isValidShortId("aB3deFGh iJk")).toBe(false);
  });
});

describe("Stream E #6 — getBriefShareUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
  afterEach(() => {
    if (originalEnv !== undefined) process.env.NEXT_PUBLIC_APP_URL = originalEnv;
    else delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("uses prod fallback when NEXT_PUBLIC_APP_URL is unset", () => {
    expect(getBriefShareUrl("aaaaaaaaaaaa")).toBe(
      "https://cadence-web-bice.vercel.app/b/aaaaaaaaaaaa"
    );
  });

  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://cadence.app";
    expect(getBriefShareUrl("aaaaaaaaaaaa")).toBe(
      "https://cadence.app/b/aaaaaaaaaaaa"
    );
  });

  it("strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://cadence.app///";
    expect(getBriefShareUrl("bbbbbbbbbbbb")).toBe(
      "https://cadence.app/b/bbbbbbbbbbbb"
    );
  });
});
