/**
 * Perplexity Sonar Reasoning Pro search provider (CAD-86 / T-521).
 *
 * Pro tier search backend. Uses Perplexity's chat-completions API with
 * model `sonar-reasoning-pro`, which performs LLM-driven web research
 * and returns both a synthesized answer AND a `citations` array of
 * source URLs. We surface the citations as `SearchResult[]` and (since
 * CAD-222, bake-off contender A2) keep the synthesized answer as
 * `SearchResponse.memo` — a bounded research memo the composer treats
 * as secondary, verify-against-sources material. Before CAD-222 the
 * synthesis was discarded, which left the Sonnet composer staring at
 * bare citation URLs with empty snippets.
 *
 * Cost model (per Perplexity pricing page, 2026-06):
 *   - Input:  $2.00 / 1M tokens
 *   - Output: $8.00 / 1M tokens
 *   - Reasoning: $3.00 / 1M tokens
 *   - Per-search fee: $5.00 / 1k searches ($0.005/req)
 *
 * Per the PRD: token caps 16K input / 6K reasoning / 3K output → ceiling
 * ~$0.105/call. Tighter than that in practice (1–2K input typical).
 *
 * Cost tracking: writes a `cost_events` row with provider="perplexity"
 * and the per-call dollar amount so the brief's `usage.searchCost`
 * metadata reflects real spend.
 */
import { recordCost } from "@/server/cost/record";
import type {
  SearchOptions,
  SearchProvider,
  SearchResponse,
  SearchResult,
} from "./types";

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const PPLX_MODEL = "sonar-reasoning-pro" as const;

// Per-token + per-search pricing (USD).
const PPLX_INPUT_PER_1M = 2.0;
const PPLX_OUTPUT_PER_1M = 8.0;
const PPLX_REASONING_PER_1M = 3.0;
const PPLX_PER_SEARCH = 0.005;

// Token caps from PRD §Cost guards.
const MAX_INPUT_TOKENS = 16_000;
const MAX_REASONING_TOKENS = 6_000;
const MAX_OUTPUT_TOKENS = 3_000;

const DEFAULT_COUNT = 10;

/**
 * Per-request timeout for the Perplexity API (CAD-97).
 *
 * Sonar Reasoning Pro performs LLM-driven web research and its legitimate
 * slow tail is 60–120s on broad queries — the CAD-222 bake-off run of
 * 2026-06-11 measured 4/5 specs timing out at the old 45s ceiling while
 * the searches themselves were succeeding. 120s matches the rationale of
 * WEBSEARCH_COMPOSER_TIMEOUT_MS (anthropic-websearch.ts): research happens
 * INSIDE the call, so the ceiling must cover research + synthesis; beyond
 * 120s it's a stuck connection. The pipeline's own retry/timeout budget
 * (Inngest maxDuration 300s) remains the outer guard.
 *
 * NOTE: providers MUST NOT retry on timeout — the digest pipeline owns
 * retry orchestration. See `types.ts` for the no-retry contract.
 */
export const REQUEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PerplexityKeyMissingError extends Error {
  constructor() {
    super(
      "Perplexity API key not configured. Set PERPLEXITY_API_KEY in env. " +
        "Get one at https://www.perplexity.ai/settings/api"
    );
    this.name = "PerplexityKeyMissingError";
  }
}

export class PerplexityApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PerplexityApiError";
  }
}

// ---------------------------------------------------------------------------
// API types (subset we use)
// ---------------------------------------------------------------------------

interface PerplexityChoice {
  message?: { content?: string };
}

/**
 * Perplexity's response shape. The `citations` field is documented as an
 * array of URL strings (legacy/stable form). Newer responses may also
 * include `search_results` with title/snippet/date — we read both and
 * prefer the richer form when present.
 */
interface PerplexitySearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string;
}

interface PerplexityUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  num_search_queries?: number;
}

interface PerplexityResponse {
  choices?: PerplexityChoice[];
  citations?: string[];
  search_results?: PerplexitySearchResult[];
  usage?: PerplexityUsage;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export function perplexityCostUsd(usage: PerplexityUsage | undefined): number {
  if (!usage) return PPLX_PER_SEARCH;
  const input = (usage.prompt_tokens ?? 0) * PPLX_INPUT_PER_1M;
  const output = (usage.completion_tokens ?? 0) * PPLX_OUTPUT_PER_1M;
  const reasoning = (usage.reasoning_tokens ?? 0) * PPLX_REASONING_PER_1M;
  const searches = (usage.num_search_queries ?? 1) * PPLX_PER_SEARCH * 1_000_000;
  return (input + output + reasoning + searches) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * CAD-222: cap on the research memo we keep from the Sonar synthesis.
 * Generous enough for a full researched answer, tight enough that the
 * memo can never dominate the composer prompt (sources stay primary).
 */
export const MEMO_MAX_CHARS = 4_000;

/**
 * Extract the synthesized research answer as a bounded memo (CAD-222).
 *
 * `sonar-reasoning-pro` interleaves its chain-of-thought in the content
 * as `<think>…</think>` blocks — that part is model scratchpad, not
 * research output, so it is stripped before bounding. Returns undefined
 * when there is no usable synthesis (empty content, think-only content).
 */
export function extractPerplexityMemo(
  json: PerplexityResponse
): string | undefined {
  const content = json.choices?.[0]?.message?.content;
  if (!content) return undefined;
  const withoutThink = content
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    // Defensive: an unclosed <think> means everything after it is
    // scratchpad (truncated response) — drop it too.
    .replace(/<think>[\s\S]*$/, "")
    .trim();
  if (!withoutThink) return undefined;
  return withoutThink.length > MEMO_MAX_CHARS
    ? withoutThink.slice(0, MEMO_MAX_CHARS)
    : withoutThink;
}

export function parsePerplexityResults(
  json: PerplexityResponse,
  count: number
): SearchResult[] {
  // Prefer the richer `search_results` array; fall back to bare citations.
  if (json.search_results && json.search_results.length > 0) {
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    for (const item of json.search_results) {
      if (!item.url) continue;
      const key = item.url.replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        url: item.url,
        title: item.title ?? item.url,
        snippet: item.snippet ?? "",
        publishedAt: item.date,
      });
      if (out.length >= count) break;
    }
    return out;
  }
  const citations = json.citations ?? [];
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const url of citations) {
    if (!url) continue;
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, title: url, snippet: "" });
    if (out.length >= count) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetch (injectable for tests)
// ---------------------------------------------------------------------------

type FetchLike = typeof fetch;

export interface PerplexitySearchDeps {
  fetchImpl?: FetchLike;
  /** Override the API key resolver (tests). */
  apiKey?: string;
}

export function isPerplexityConfigured(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY);
}

/**
 * Internal core — exposed so the SearchProvider wrapper can stay tiny
 * and so tests can inject `fetchImpl`.
 */
export async function perplexitySearch(
  query: string,
  opts: SearchOptions = {},
  deps: PerplexitySearchDeps = {}
): Promise<SearchResponse> {
  if (!query.trim()) {
    return { query, results: [], fromCache: false, costUsd: 0 };
  }

  const apiKey = deps.apiKey ?? process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new PerplexityKeyMissingError();
  }

  const count = Math.min(opts.count ?? DEFAULT_COUNT, 20);
  const fetchFn = deps.fetchImpl ?? fetch;

  const body = {
    model: PPLX_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a market research assistant. For the user's query, perform deep web research and return a concise, fact-dense answer with clear inline citations. Prefer recent (last 14 days) sources for news; authoritative sources for prices and policy.",
      },
      { role: "user", content: query },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    // Perplexity-specific knobs documented for sonar-reasoning-pro.
    reasoning_effort: "medium",
    // Encourage breadth so we cap distinct sources at `count`.
    search_recency_filter: "month",
  };

  const res = await fetchFn(PERPLEXITY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PerplexityApiError(
      res.status,
      `Perplexity ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as PerplexityResponse;
  const results = parsePerplexityResults(json, count);
  const memo = extractPerplexityMemo(json);

  // Cap usage to PRD guards (logged ceiling, not enforced server-side
  // here — Perplexity ignores oversize requests on input/reasoning;
  // we cap our cost estimate so a misconfigured response can't blow
  // out the per-brief cost line.)
  const usage: PerplexityUsage = {
    prompt_tokens: Math.min(json.usage?.prompt_tokens ?? 0, MAX_INPUT_TOKENS),
    completion_tokens: Math.min(
      json.usage?.completion_tokens ?? 0,
      MAX_OUTPUT_TOKENS
    ),
    reasoning_tokens: Math.min(
      json.usage?.reasoning_tokens ?? 0,
      MAX_REASONING_TOKENS
    ),
    num_search_queries: json.usage?.num_search_queries ?? 1,
  };
  const costUsd = perplexityCostUsd(usage);

  // Fire-and-forget — never block the search response on cost logging.
  // recordCost itself swallows errors, but the underlying postgres
  // client can hang on missing DATABASE_URL in unit tests, so we also
  // detach the promise here.
  void recordCost({
    userId: opts.userId ?? null,
    digestRunId: opts.digestRunId ?? null,
    kind: "search_api",
    provider: "perplexity",
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    costUsd,
  });

  return {
    query,
    results,
    fromCache: false,
    costUsd,
    ...(memo !== undefined ? { memo } : {}),
  };
}

// ---------------------------------------------------------------------------
// SearchProvider wrapper
// ---------------------------------------------------------------------------

export const proSearchProvider: SearchProvider = {
  id: "perplexity-sonar-reasoning-pro",
  async search(query, opts = {}) {
    return perplexitySearch(query, opts);
  },
};
