/**
 * CAD-221 (S3) — entity-aware search-query budget.
 *
 * Contract: same 5-query spend, but companies now reach retrieval. With
 * entities: ≤2 topics + ≤3 companies. Without: up to 5 topics (legacy
 * behavior preserved). Case-insensitive dedup, order stable.
 */
import { describe, it, expect } from "vitest";
import { buildSearchQueries } from "@/server/digest/run";

describe("buildSearchQueries", () => {
  it("no entities: up to 5 topics (legacy behavior)", () => {
    expect(
      buildSearchQueries({ topics: ["a1", "b2", "c3", "d4", "e5", "f6"] })
    ).toEqual(["a1", "b2", "c3", "d4", "e5"]);
  });

  it("with companies: 2 topics + 3 companies, capped at 5", () => {
    expect(
      buildSearchQueries({
        topics: ["palm oil", "logistics saas", "extra topic"],
        entities: { companies: ["Lalamove", "Ninja Van", "GoGoX", "Fourth Co"] },
      })
    ).toEqual(["palm oil", "logistics saas", "Lalamove", "Ninja Van", "GoGoX"]);
  });

  it("companies surface even when topics are few", () => {
    expect(
      buildSearchQueries({
        topics: ["freight"],
        entities: { companies: ["Lalamove"] },
      })
    ).toEqual(["freight", "Lalamove"]);
  });

  it("dedupes case-insensitively, preserving first occurrence", () => {
    expect(
      buildSearchQueries({
        topics: ["Lalamove", "freight"],
        entities: { companies: ["lalamove", "Ninja Van"] },
      })
    ).toEqual(["Lalamove", "freight", "Ninja Van"]);
  });

  it("filters junk company entries (<3 chars, blank)", () => {
    expect(
      buildSearchQueries({
        topics: ["freight"],
        entities: { companies: ["", "ab", "Ninja Van"] },
      })
    ).toEqual(["freight", "Ninja Van"]);
  });

  it("topics fill the budget when companies are few (review P2-12)", () => {
    // 1 company used to cap topics at 2 → only 3 queries. Topics now fill
    // whatever the companies leave of the 5-query budget.
    expect(
      buildSearchQueries({
        topics: ["a1", "b2", "c3", "d4", "e5"],
        entities: { companies: ["Lalamove"] },
      })
    ).toEqual(["a1", "b2", "c3", "d4", "Lalamove"]);
  });

  it("ms-language specs anchor topic queries with Malaysia (CAD-224 #3)", () => {
    expect(
      buildSearchQueries({
        topics: ["Government contracts", "Malaysia palm oil"],
        language: "ms",
        entities: { companies: ["Lalamove"] },
      })
    ).toEqual([
      "Government contracts Malaysia", // hint appended
      "Malaysia palm oil", // already names it — untouched
      "Lalamove", // company names stay untouched
    ]);
  });

  it("non-ms languages get no locale hint", () => {
    expect(
      buildSearchQueries({ topics: ["Government contracts"], language: "en" })
    ).toEqual(["Government contracts"]);
  });

  it("empty spec yields no queries", () => {
    expect(buildSearchQueries({})).toEqual([]);
  });
});
