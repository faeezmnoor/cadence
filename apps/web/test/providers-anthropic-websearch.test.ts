/**
 * CAD-222 — bake-off contender A3: Sonnet + Anthropic web-search server
 * tool. Mocked-fetch tests only (repo rule: no test hits a real LLM API).
 *
 * Cost recording is mocked at the module boundary (recordCost would
 * otherwise reach for the db client); the pricing helpers stay real so
 * the cost math is exercised.
 */
import { describe, it, expect, vi } from "vitest";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";
import type { ComposerInput } from "@/server/ai/composer/types";
import type { BriefJson } from "@/server/ai/composer/schema";

vi.mock("@/server/cost/record", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/cost/record")>();
  return { ...actual, recordCost: vi.fn(async () => undefined) };
});

import {
  composeDigestWebSearch,
  countWebSearches,
  extractAssistantText,
  webSearchComposerProvider,
  AnthropicKeyMissingError,
  AnthropicWebSearchApiError,
  MAX_PAUSE_CONTINUATIONS,
  MAX_WEB_SEARCHES,
  WEB_SEARCH_TOOL_TYPE,
} from "@/server/ai/providers/anthropic-websearch";
import {
  buildWebSearchComposerSystemPrompt,
  WEBSEARCH_PROMPT_TAG,
} from "@/server/ai/providers/anthropic-websearch-prompt";
import { PRO_PROMPT_TAG } from "@/server/ai/providers/anthropic-pro-prompt";
import { PRO_COMPOSER_MODEL_ID } from "@/server/ai/providers/anthropic-pro";
import { getBakeoffStack } from "@/server/ai/providers";
// Mocked module — importOriginal keeps the real pricing constants.
import { ANTHROPIC_WEB_SEARCH_PER_1K_USD } from "@/server/cost/record";

function input(): ComposerInput {
  return { spec: emptyDigestSpec(), sources: { search: [], rss: [] } };
}

/** Minimal brief that passes schema + citation parity. */
const VALID_BRIEF: BriefJson = {
  schema_version: 1,
  header: {
    date: "11 Jun 2026",
    cadence_label: "Daily",
    industry: "Palm oil",
    personalization_summary: "KL trader",
  },
  tldr: "CPO steady [1].",
  sections: [
    {
      heading: "Prices",
      bullets: [{ text: "CPO flat on quota news [1]", citation_markers: [1] }],
    },
  ],
  why_it_matters: "Quota news touches your CPO position.",
  feedback_cta: "Reply 👍 / 👎",
  sources: [
    { marker: 1, title: "MPOB", url: "https://example.com/mpob" },
  ],
};

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successBody(overrides: Record<string, unknown> = {}) {
  return {
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search" },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [],
      },
      { type: "text", text: JSON.stringify(VALID_BRIEF) },
    ],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 2_000,
      output_tokens: 800,
      server_tool_use: { web_search_requests: 2 },
    },
    ...overrides,
  };
}

describe("CAD-222 A3 prompt", () => {
  it("appends the web-search addendum AFTER the full Pro prompt", () => {
    const p = buildWebSearchComposerSystemPrompt(input());
    expect(p).toContain(WEBSEARCH_PROMPT_TAG);
    expect(p).toContain(PRO_PROMPT_TAG);
    expect(p).toMatch(/2-3 TARGETED searches/);
    // Addendum amends rule 5, so it must come after the base contract.
    const contractIdx = p.indexOf("OUTPUT CONTRACT");
    const addendumIdx = p.indexOf(WEBSEARCH_PROMPT_TAG);
    expect(addendumIdx).toBeGreaterThan(contractIdx);
  });

  it("instructs folding searched URLs into the numbered sources", () => {
    const p = buildWebSearchComposerSystemPrompt(input());
    expect(p).toMatch(/ADDITIONAL numbered entry/);
    expect(p).toMatch(/amends hard rule 5/);
  });
});

describe("CAD-222 A3 compose (mocked fetch)", () => {
  it("throws a clear error when ANTHROPIC_API_KEY is missing", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(composeDigestWebSearch(input())).rejects.toBeInstanceOf(
        AnthropicKeyMissingError
      );
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("sends the web_search server tool with the locked model + temperature", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = async (_url: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return apiResponse(successBody());
    };
    await composeDigestWebSearch(input(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });
    expect(calls).toHaveLength(1);
    const body = calls[0];
    expect(body.model).toBe(PRO_COMPOSER_MODEL_ID);
    expect(body.temperature).toBe(0.25);
    expect(body.tools).toEqual([
      { type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: MAX_WEB_SEARCHES },
    ]);
    expect(String(body.system)).toContain(WEBSEARCH_PROMPT_TAG);
  });

  it("parses the brief from text blocks and prices the search surcharge", async () => {
    const fetchImpl = async () => apiResponse(successBody());
    const out = await composeDigestWebSearch(input(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });
    expect(out.modelId).toBe(PRO_COMPOSER_MODEL_ID);
    expect(out.brief).toMatchObject({ tldr: "CPO steady [1]." });
    expect(out.markdown.length).toBeGreaterThan(0);
    // Sonnet tokens: 2000 in @ $3/M + 800 out @ $15/M = 0.006 + 0.012;
    // plus 2 searches at the per-1k surcharge.
    const expected =
      (2_000 * 3 + 800 * 15) / 1_000_000 +
      2 * (ANTHROPIC_WEB_SEARCH_PER_1K_USD / 1_000);
    expect(out.costUsd).toBeCloseTo(expected, 6);
  });

  it("continues a pause_turn by passing the assistant turn back, bounded", async () => {
    const bodies: Array<{ messages: Array<{ role: string }> }> = [];
    let n = 0;
    const fetchImpl = async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      n++;
      if (n === 1) {
        return apiResponse(
          successBody({
            stop_reason: "pause_turn",
            content: [
              { type: "server_tool_use", id: "srvtoolu_1", name: "web_search" },
            ],
            usage: {
              input_tokens: 1_000,
              output_tokens: 100,
              server_tool_use: { web_search_requests: 1 },
            },
          })
        );
      }
      return apiResponse(successBody());
    };
    const out = await composeDigestWebSearch(input(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: "test-key",
    });
    expect(n).toBe(2);
    // Continuation appended the paused assistant turn.
    expect(bodies[1].messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    // Tokens + searches summed across the paused turn and the final one.
    expect(out.inputTokens).toBe(3_000);
    expect(out.outputTokens).toBe(900);
    const expected =
      (3_000 * 3 + 900 * 15) / 1_000_000 +
      3 * (ANTHROPIC_WEB_SEARCH_PER_1K_USD / 1_000);
    expect(out.costUsd).toBeCloseTo(expected, 6);
    expect(MAX_PAUSE_CONTINUATIONS).toBeGreaterThanOrEqual(1);
  });

  it("throws AnthropicWebSearchApiError on non-2xx without retrying", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      return new Response("overloaded", { status: 529 });
    };
    await expect(
      composeDigestWebSearch(input(), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: "test-key",
      })
    ).rejects.toBeInstanceOf(AnthropicWebSearchApiError);
    expect(n).toBe(1);
  });
});

describe("CAD-222 A3 pure helpers", () => {
  it("extractAssistantText joins only text blocks", () => {
    expect(
      extractAssistantText([
        { type: "server_tool_use" },
        { type: "text", text: "a" },
        { type: "web_search_tool_result" },
        { type: "text", text: "b" },
      ])
    ).toBe("a\nb");
    expect(extractAssistantText(undefined)).toBe("");
  });

  it("countWebSearches reads usage.server_tool_use", () => {
    expect(countWebSearches({ server_tool_use: { web_search_requests: 3 } })).toBe(3);
    expect(countWebSearches({})).toBe(0);
    expect(countWebSearches(undefined)).toBe(0);
  });
});

describe("CAD-222 getBakeoffStack registry", () => {
  it("perplexity_sonnet = Perplexity search + Pro Sonnet composer", () => {
    const stack = getBakeoffStack("perplexity_sonnet");
    expect(stack.search?.id).toBe("perplexity-sonar-reasoning-pro");
    expect(stack.composer.id).toBe("anthropic-sonnet-pro");
  });

  it("sonnet_websearch = websearch composer, NO search step", () => {
    const stack = getBakeoffStack("sonnet_websearch");
    expect(stack.search).toBeUndefined();
    expect(stack.composer.id).toBe("anthropic-sonnet-websearch");
    expect(stack.composer.modelId).toBe(PRO_COMPOSER_MODEL_ID);
  });

  it("provider wrapper exposes the same compose", () => {
    expect(webSearchComposerProvider.id).toBe("anthropic-sonnet-websearch");
  });
});
