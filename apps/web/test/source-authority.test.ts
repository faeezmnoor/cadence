/**
 * CAD-226 — source-authority registry + prompt wiring.
 *
 * The grounding bar for un-pausing advanced research is mean grounding
 * ≥4.0; these tests lock the plumbing that pulls citations toward
 * primary publishers (the eval measures the outcome; this measures the
 * wiring).
 */
import { describe, it, expect } from "vitest";
import {
  AUTHORITY_DOMAINS,
  authorityDomainsForSpec,
} from "@/server/sources/authority";
import { buildComposerSystemPrompt } from "@/server/ai/composer/prompt";
import { buildWebSearchComposerSystemPrompt } from "@/server/ai/providers/anthropic-websearch-prompt";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";
import type { ComposerInput } from "@/server/ai/composer/types";

function inputFor(topics: string[], companies: string[] = []): ComposerInput {
  return {
    spec: {
      ...emptyDigestSpec(),
      topics,
      entities: { companies, tickers: [], commodities: [] },
    },
    sources: { search: [], rss: [] },
  } as ComposerInput;
}

describe("authorityDomainsForSpec", () => {
  it("palm-oil specs prefer MPOB + USDA", () => {
    const domains = authorityDomainsForSpec({ topics: ["palm oil market"] });
    expect(domains).toContain("mpob.gov.my");
    expect(domains).toContain("usda.gov");
  });

  it("Malaysian gov-procurement specs surface official portals", () => {
    const domains = authorityDomainsForSpec({
      topics: ["Government contracts", "public procurement"],
      entities: { companies: ["ePerolehan"], tickers: [], commodities: [] },
    });
    expect(domains).toContain("eperolehan.gov.my");
    expect(domains).toContain("bnm.gov.my");
  });

  it("dedupes across buckets and caps at 12", () => {
    const domains = authorityDomainsForSpec({
      topics: [
        "palm oil",
        "malaysia regulatory policy",
        "banking",
        "equities",
        "commodities",
        "oil and gas",
      ],
    });
    expect(new Set(domains).size).toBe(domains.length);
    expect(domains.length).toBeLessThanOrEqual(12);
  });

  it("unmatched topics yield no domains (generic rule still applies in prompt)", () => {
    expect(authorityDomainsForSpec({ topics: ["underwater basket weaving"] })).toEqual([]);
  });

  it("registry contains no obvious low-authority domains", () => {
    for (const domains of Object.values(AUTHORITY_DOMAINS)) {
      for (const d of domains) {
        expect(d).not.toMatch(/blogspot|medium\.com|substack|wordpress/);
      }
    }
  });
});

describe("composer prompt authority wiring", () => {
  it("includes the SOURCE AUTHORITY hard rule", () => {
    const prompt = buildComposerSystemPrompt(inputFor(["palm oil"]));
    expect(prompt).toContain("SOURCE AUTHORITY");
    expect(prompt).toMatch(/most authoritative/);
  });

  it("names per-spec authoritative domains when buckets match", () => {
    const prompt = buildComposerSystemPrompt(inputFor(["palm oil"]));
    expect(prompt).toContain("mpob.gov.my");
  });

  it("omits the domain line when no bucket matches", () => {
    const prompt = buildComposerSystemPrompt(inputFor(["underwater basket weaving"]));
    expect(prompt).not.toContain("Authoritative domains for THIS brief");
    // generic preference rule still present
    expect(prompt).toContain("SOURCE AUTHORITY");
  });

  it("web-search composer adds the primary-source search instruction", () => {
    const prompt = buildWebSearchComposerSystemPrompt(inputFor(["palm oil"]));
    expect(prompt).toContain("SEARCH FOR PRIMARY SOURCES");
    expect(prompt).toMatch(/official publisher > national wire/);
  });
});
