/**
 * CAD-86 / T-521 — Perplexity Sonar Reasoning Pro client.
 *
 * Mocked-fetch tests only. Real network calls cost real money and the
 * PRD bans live Pro briefs from this foundation agent.
 */
import { describe, it, expect } from "vitest";
import {
  extractPerplexityMemo,
  isPerplexityConfigured,
  parsePerplexityResults,
  perplexityCostUsd,
  perplexitySearch,
  MEMO_MAX_CHARS,
  PerplexityApiError,
  PerplexityKeyMissingError,
} from "@/server/ai/providers/perplexity";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CAD-86 Perplexity client", () => {
  describe("isPerplexityConfigured", () => {
    it("returns false when env unset", () => {
      const prev = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;
      try {
        expect(isPerplexityConfigured()).toBe(false);
      } finally {
        if (prev !== undefined) process.env.PERPLEXITY_API_KEY = prev;
      }
    });
  });

  describe("PerplexityKeyMissingError", () => {
    it("points at the settings URL", () => {
      const err = new PerplexityKeyMissingError();
      expect(err.message).toMatch(/perplexity\.ai\/settings\/api/);
    });
  });

  describe("parsePerplexityResults", () => {
    it("prefers search_results when present", () => {
      const out = parsePerplexityResults(
        {
          search_results: [
            {
              url: "https://example.com/a",
              title: "A",
              snippet: "snippet a",
              date: "2026-06-01",
            },
            {
              url: "https://example.com/b",
              title: "B",
              snippet: "snippet b",
            },
          ],
        },
        10
      );
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({
        url: "https://example.com/a",
        title: "A",
        snippet: "snippet a",
        publishedAt: "2026-06-01",
      });
    });

    it("falls back to bare citations[]", () => {
      const out = parsePerplexityResults(
        { citations: ["https://x.com/p1", "https://y.com/p2"] },
        10
      );
      expect(out).toHaveLength(2);
      expect(out[0].url).toBe("https://x.com/p1");
      expect(out[0].snippet).toBe("");
    });

    it("dedupes by URL ignoring trailing slash", () => {
      const out = parsePerplexityResults(
        {
          search_results: [
            { url: "https://x.com/a/", title: "A" },
            { url: "https://x.com/a", title: "A dup" },
            { url: "https://x.com/b", title: "B" },
          ],
        },
        10
      );
      expect(out).toHaveLength(2);
      expect(out.map((r) => r.title)).toEqual(["A", "B"]);
    });

    it("respects the count cap", () => {
      const out = parsePerplexityResults(
        {
          search_results: [
            { url: "https://x.com/1" },
            { url: "https://x.com/2" },
            { url: "https://x.com/3" },
          ],
        },
        2
      );
      expect(out).toHaveLength(2);
    });
  });

  describe("extractPerplexityMemo (CAD-222 A2 — keep the Sonar synthesis)", () => {
    it("returns the synthesized answer from choices[0].message.content", () => {
      const memo = extractPerplexityMemo({
        choices: [{ message: { content: "CPO eased 0.4% on quota news." } }],
      });
      expect(memo).toBe("CPO eased 0.4% on quota news.");
    });

    it("strips <think> reasoning blocks before bounding", () => {
      const memo = extractPerplexityMemo({
        choices: [
          {
            message: {
              content:
                "<think>let me reason\nabout this</think>Real answer here.<think>more</think> Tail.",
            },
          },
        ],
      });
      expect(memo).toBe("Real answer here. Tail.");
    });

    it("drops everything after an unclosed <think> (truncated response)", () => {
      const memo = extractPerplexityMemo({
        choices: [
          { message: { content: "Answer first. <think>truncated reasoning" } },
        ],
      });
      expect(memo).toBe("Answer first.");
    });

    it("bounds the memo to MEMO_MAX_CHARS", () => {
      const memo = extractPerplexityMemo({
        choices: [{ message: { content: "x".repeat(MEMO_MAX_CHARS + 500) } }],
      });
      expect(memo).toHaveLength(MEMO_MAX_CHARS);
    });

    it("returns undefined when there is no usable synthesis", () => {
      expect(extractPerplexityMemo({})).toBeUndefined();
      expect(extractPerplexityMemo({ choices: [] })).toBeUndefined();
      expect(
        extractPerplexityMemo({ choices: [{ message: { content: "" } }] })
      ).toBeUndefined();
      expect(
        extractPerplexityMemo({
          choices: [{ message: { content: "<think>only scratchpad</think>" } }],
        })
      ).toBeUndefined();
    });
  });

  describe("perplexityCostUsd", () => {
    it("returns per-search floor when usage is undefined", () => {
      expect(perplexityCostUsd(undefined)).toBeCloseTo(0.005, 5);
    });

    it("sums token + search components", () => {
      // 1M input @ $2 = $2; 1M output @ $8 = $8; 1M reasoning @ $3 = $3;
      // 1 search @ $0.005 = $0.005.
      const cost = perplexityCostUsd({
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
        reasoning_tokens: 1_000_000,
        num_search_queries: 1,
      });
      expect(cost).toBeCloseTo(13.005, 3);
    });
  });

  describe("perplexitySearch (mocked fetch)", () => {
    it("throws when no API key configured", async () => {
      const prev = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;
      try {
        await expect(perplexitySearch("test", {})).rejects.toBeInstanceOf(
          PerplexityKeyMissingError
        );
      } finally {
        if (prev !== undefined) process.env.PERPLEXITY_API_KEY = prev;
      }
    });

    it("returns empty for empty query without hitting fetch", async () => {
      const fetchImpl = () => {
        throw new Error("fetch should not be called");
      };
      const out = await perplexitySearch("   ", {}, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: "test-key",
      });
      expect(out.results).toEqual([]);
      expect(out.costUsd).toBe(0);
    });

    it("parses a successful response and returns costUsd > 0", async () => {
      const fetchImpl = async () =>
        jsonResponse({
          choices: [{ message: { content: "synthesized answer" } }],
          search_results: [
            {
              url: "https://reuters.com/palm-oil-quota",
              title: "MPOB lifts quota",
              snippet: "Quota +12% for June",
              date: "2026-06-02",
            },
          ],
          usage: {
            prompt_tokens: 500,
            completion_tokens: 200,
            reasoning_tokens: 800,
            num_search_queries: 1,
          },
        });

      const out = await perplexitySearch(
        "palm oil price malaysia",
        { count: 5 },
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          apiKey: "test-key",
        }
      );

      expect(out.results).toHaveLength(1);
      expect(out.results[0].url).toBe("https://reuters.com/palm-oil-quota");
      expect(out.fromCache).toBe(false);
      expect(out.costUsd).toBeGreaterThan(0);
      // CAD-222 A2: the Sonar synthesis is kept, not discarded.
      expect(out.memo).toBe("synthesized answer");
    });

    it("omits memo when the response has no synthesis", async () => {
      const fetchImpl = async () =>
        jsonResponse({
          citations: ["https://x.com/p1"],
          usage: { prompt_tokens: 100, completion_tokens: 0 },
        });
      const out = await perplexitySearch("query", {}, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: "test-key",
      });
      expect(out.memo).toBeUndefined();
      expect("memo" in out).toBe(false);
    });

    it("throws PerplexityApiError on non-200", async () => {
      const fetchImpl = async () =>
        new Response("rate limited", { status: 429 });
      await expect(
        perplexitySearch("x", {}, {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toBeInstanceOf(PerplexityApiError);
    });
  });
});
