/**
 * CAD-165 / CAD-228 — web-search provider registry + fallback + wiring pins.
 *
 * Mocks the DuckDuckGo connector (no network) so searchWithFallback's branch
 * logic is exercised deterministically. Structural source-string pins guard
 * the cross-file wiring contract the way pro-tier-spec-tier.test.ts does for
 * the tier registry.
 */
import { vi, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// Keep parseDuckDuckGoHtml real, stub the networked search.
vi.mock("@/server/connectors/duckduckgo", async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    duckDuckGoSearch: vi.fn(async (query: string) => ({
      query,
      results: [{ title: "DDG hit", url: "https://ddg.example/x", snippet: "snip" }],
    })),
  };
});

import {
  resolveSearcher,
  normalizeSearcherId,
  SEARCHER_IDS,
  searchWithFallback,
} from "@/server/ai/providers/searchers";
import { SEARCHER_OPTIONS } from "@/lib/search-providers";
import type { SearchProvider } from "@/server/ai/providers/types";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("resolveSearcher / normalizeSearcherId", () => {
  it("maps known ids to their provider", () => {
    expect(resolveSearcher("brave").id).toBe("brave");
    expect(resolveSearcher("duckduckgo").id).toBe("duckduckgo");
  });
  it("falls back to brave for unknown/missing", () => {
    expect(resolveSearcher("bogus").id).toBe("brave");
    expect(normalizeSearcherId(undefined)).toBe("brave");
    expect(normalizeSearcherId("duckduckgo")).toBe("duckduckgo");
  });
});

describe("searchWithFallback (keyless DuckDuckGo backstop)", () => {
  it("uses the primary when it returns results", async () => {
    const primary: SearchProvider = {
      id: "brave",
      search: vi.fn(async (query) => ({
        query,
        results: [{ url: "https://brave.example/a", title: "Brave", snippet: "b" }],
        fromCache: false,
        costUsd: 0,
      })),
    };
    const r = await searchWithFallback(primary, "palm oil");
    expect(r.provider).toBe("brave");
    expect(r.usedFallback).toBe(false);
    expect(r.hits[0]).toMatchObject({ url: "https://brave.example/a", description: "b" });
  });

  it("falls back to DuckDuckGo when the primary throws", async () => {
    const primary: SearchProvider = {
      id: "brave",
      search: vi.fn(async () => {
        throw new Error("brave key expired");
      }),
    };
    const r = await searchWithFallback(primary, "palm oil");
    expect(r.provider).toBe("duckduckgo");
    expect(r.usedFallback).toBe(true);
    expect(r.hits[0]).toMatchObject({ url: "https://ddg.example/x", description: "snip" });
  });

  it("falls back to DuckDuckGo when the primary returns zero results", async () => {
    const primary: SearchProvider = {
      id: "brave",
      search: vi.fn(async (query) => ({ query, results: [], fromCache: false, costUsd: 0 })),
    };
    const r = await searchWithFallback(primary, "palm oil");
    expect(r.provider).toBe("duckduckgo");
    expect(r.usedFallback).toBe(true);
  });

  it("does NOT recurse when DuckDuckGo itself is the primary and fails", async () => {
    const primary: SearchProvider = {
      id: "duckduckgo",
      search: vi.fn(async () => {
        throw new Error("ddg down");
      }),
    };
    const r = await searchWithFallback(primary, "palm oil");
    expect(r.hits).toEqual([]);
    expect(r.usedFallback).toBe(false);
  });
});

describe("registry drift guards", () => {
  it("server SEARCHER_IDS matches the client SEARCHER_OPTIONS list", () => {
    expect([...SEARCHER_IDS].sort()).toEqual(SEARCHER_OPTIONS.map((o) => o.id).sort());
  });

  it("migration 0028 CHECK + apply runner cover every registered id", () => {
    const sql = read("../server/db/migrations/0028_digest_specs_searcher.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+searcher text NOT NULL DEFAULT 'brave'/i);
    const runner = read("../server/db/apply-0028.mjs");
    for (const id of SEARCHER_IDS) {
      expect(sql).toContain(`'${id}'`);
      expect(runner).toContain(`"${id}"`);
    }
  });

  it("schema.ts declares the searcher column (default brave)", () => {
    const schema = read("../server/db/schema.ts");
    expect(schema).toMatch(/searcher:\s*text\("searcher"\)\.notNull\(\)\.default\("brave"\)/);
  });
});

describe("wiring pins", () => {
  it("briefs router exposes setSearcher with the full provider enum", () => {
    const router = read("../server/trpc/routers/briefs.ts");
    expect(router).toMatch(/setSearcher:\s*protectedProcedure/);
    for (const id of SEARCHER_IDS) expect(router).toContain(`"${id}"`);
  });

  it("digest/run.ts resolves the spec searcher + runs the fallback", () => {
    const run = read("../server/digest/run.ts");
    expect(run).toMatch(/from "@\/server\/ai\/providers\/searchers"/);
    expect(run).toMatch(/resolveSearcher\(specRow\.searcher\)/);
    expect(run).toMatch(/searchWithFallback\(webSearcher/);
  });

  it("brief detail renders the SearchProviderSettings picker wired to setSearcher", () => {
    const client = read("../app/briefs/[id]/brief-detail-client.tsx");
    expect(client).toMatch(/<SearchProviderSettings brief=\{brief\}/);
    expect(client).toMatch(/trpc\.briefs\.setSearcher\.useMutation/);
    expect(client).toMatch(/SEARCHER_OPTIONS\.map/);
    expect(client).toMatch(/searcher-option-\$\{opt\.id\}/);
  });
});
