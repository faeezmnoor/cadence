/**
 * CAD-222 — bake-off contender A3: Sonnet Pro compose + Anthropic native
 * web-search server tool.
 *
 * Same Pro Sonnet compose as `anthropic-pro.ts` (identical model id,
 * temperature, shared `composeBriefWithRepair` driver, same BriefJson
 * contract) — but with the `web_search_20250305` server tool enabled and
 * a prompt addendum instructing 2-3 targeted searches to fill gaps in
 * the provided sources. Searched URLs are folded into the brief's own
 * numbered `sources` array by the model (see the prompt module for the
 * documented folding approach); citation parity validates them exactly
 * like provided sources.
 *
 * WHY RAW FETCH, NOT THE AI SDK: the installed `@ai-sdk/anthropic@1.2.12`
 * predates the web-search server tool. Its provider-defined tool switch
 * (dist/index.js `prepareTools`) only recognises the bash / text_editor /
 * computer tool ids and SILENTLY DROPS anything else with an
 * "unsupported-tool" warning — `ai@4.x` has no raw server-tool
 * pass-through. Rather than ship a throwing stub, we call the Messages
 * API directly (the same raw-fetch pattern `perplexity.ts` uses) and feed
 * the text back through the SHARED repair driver, so parse / parity
 * semantics cannot diverge from the other composers. Revisit when the app
 * upgrades to ai@5 / @ai-sdk/anthropic@2 — those expose
 * `anthropic.tools.webSearch_20250305` natively.
 *
 * Server-tool turn lifecycle: with server tools Anthropic executes the
 * searches inside the turn. On long turns the API may return
 * `stop_reason: "pause_turn"` — the documented continuation is to re-POST
 * with the paused assistant turn appended to `messages`. We allow at most
 * MAX_PAUSE_CONTINUATIONS of those per model call; this is turn plumbing,
 * not a retry, so the CAD-97 no-retry contract is untouched (timeouts and
 * non-2xx still throw immediately).
 *
 * Cost: token cost at Sonnet pricing PLUS the per-search surcharge —
 * `usage.server_tool_use.web_search_requests` summed across all calls of
 * one logical compose, priced via `anthropicWebSearchCostUsd`. One
 * cost_events row per compose with provider "anthropic_websearch".
 */
import {
  anthropicWebSearchCostUsd,
  recordCost,
} from "@/server/cost/record";
import { renderBriefMarkdown } from "@/server/ai/composer/render";
import {
  composeBriefWithRepair,
  COMPOSE_USER_MESSAGE,
} from "@/server/ai/composer/compose";
import { PRO_COMPOSER_MODEL_ID } from "./anthropic-pro";
import { buildWebSearchComposerSystemPrompt } from "./anthropic-websearch-prompt";
import type { ComposerInput, ComposerOutput } from "@/server/ai/composer/types";
import type { ComposerProvider } from "./types";

const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Server tool type string — pinned by tests. */
export const WEB_SEARCH_TOOL_TYPE = "web_search_20250305" as const;

/**
 * CAD-226 grounding: web_fetch lets the composer OPEN the specific page a
 * search surfaced and cite that page — the informed-judge eval showed the
 * dominant grounding defect was precise figures cited to homepage/landing
 * URLs that cannot contain them. Same GA pairing the API docs recommend
 * for this model (web_search_20250305 + web_fetch_20250910); no per-fetch
 * surcharge, only token cost, bounded by MAX_FETCH_CONTENT_TOKENS.
 */
export const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910" as const;
export const MAX_WEB_FETCHES = 3;
export const MAX_FETCH_CONTENT_TOKENS = 12_000;

/** Hard cap on searches per compose attempt (`max_uses`). The prompt asks
 *  for 2-3 targeted searches; the API enforces this ceiling. */
export const MAX_WEB_SEARCHES = 3;

const WEBSEARCH_MAX_OUTPUT_TOKENS = 3_000;

/**
 * Per-request timeout (CAD-97 contract: one timeout, no provider retry).
 * Wider than the plain Pro composer's 60s because the server-side web
 * searches happen INSIDE the turn — 2-3 searches + compose legitimately
 * runs 60-90s. Beyond 120s it's a stuck connection.
 */
export const WEBSEARCH_COMPOSER_TIMEOUT_MS = 120_000;

/** Bounded `pause_turn` continuations per model call (turn plumbing, not
 *  retry — see file header). */
export const MAX_PAUSE_CONTINUATIONS = 2;

/**
 * CAD-224 #4 (review finding 4): wall-clock budget for one logical
 * compose. Gates BOTH further pause_turn continuations and the
 * corrective retry — without the continuation gate, one attempt alone
 * could run 3 × 120s = 360s and blow the route's 300s Inngest ceiling.
 * Worst case with the gate: a continuation issued just under the
 * deadline finishes by ~deadline + 120s ≈ 270s.
 */
export const COMPOSE_DEADLINE_MS = 150_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AnthropicKeyMissingError extends Error {
  constructor() {
    super(
      "Anthropic API key not configured. Set ANTHROPIC_API_KEY in env — " +
        "the web-search composer (CAD-222 contender A3) calls the Messages " +
        "API directly."
    );
    this.name = "AnthropicKeyMissingError";
  }
}

export class AnthropicWebSearchApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AnthropicWebSearchApiError";
  }
}

// ---------------------------------------------------------------------------
// API types (subset we use)
// ---------------------------------------------------------------------------

/**
 * Content blocks we care about: `text` carries the brief JSON; the
 * `server_tool_use` / `web_search_tool_result` blocks are the model's own
 * working material and only matter for pause_turn continuation (passed
 * back verbatim).
 */
interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: AnthropicUsage;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Join the assistant `text` blocks; tool-use blocks are skipped. The
 *  shared extractor downstream tolerates preamble around the JSON. */
export function extractAssistantText(
  content: AnthropicContentBlock[] | undefined
): string {
  if (!content) return "";
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

export function countWebSearches(usage: AnthropicUsage | undefined): number {
  return usage?.server_tool_use?.web_search_requests ?? 0;
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

type FetchLike = typeof fetch;

export interface WebSearchComposeDeps {
  fetchImpl?: FetchLike;
  /** Override the API key resolver (tests). */
  apiKey?: string;
}

export async function composeDigestWebSearch(
  input: ComposerInput,
  deps: WebSearchComposeDeps = {}
): Promise<ComposerOutput> {
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AnthropicKeyMissingError();
  const fetchFn = deps.fetchImpl ?? fetch;
  const composeDeadlineAtMs = Date.now() + COMPOSE_DEADLINE_MS;

  const systemPrompt = buildWebSearchComposerSystemPrompt(input);

  // Searches + tokens summed across every API call of this logical
  // compose (pause_turn continuations + the bounded CAD-219 corrective
  // retry). Accumulated OUTSIDE the repair driver so a failed compose
  // (both attempts bad JSON / parity) still records what it spent —
  // review P1-5: the circuit breaker's stated runaway scenario is
  // exactly "repeated Pro composer failures incurring full per-call
  // cost", which writes no cost_events on the success-only path.
  let totalWebSearches = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const callOnce = async (
    system: string,
    messages: Array<{ role: string; content: unknown }>
  ): Promise<AnthropicMessageResponse> => {
    const res = await fetchFn(ANTHROPIC_MESSAGES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: PRO_COMPOSER_MODEL_ID,
        max_tokens: WEBSEARCH_MAX_OUTPUT_TOKENS,
        temperature: 0.25,
        system,
        messages,
        tools: [
          {
            type: WEB_SEARCH_TOOL_TYPE,
            name: "web_search",
            max_uses: MAX_WEB_SEARCHES,
          },
          {
            type: WEB_FETCH_TOOL_TYPE,
            name: "web_fetch",
            max_uses: MAX_WEB_FETCHES,
            max_content_tokens: MAX_FETCH_CONTENT_TOKENS,
          },
        ],
      }),
      signal: AbortSignal.timeout(WEBSEARCH_COMPOSER_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AnthropicWebSearchApiError(
        res.status,
        `Anthropic ${res.status}: ${text.slice(0, 300)}`
      );
    }
    return (await res.json()) as AnthropicMessageResponse;
  };

  let composed: Awaited<ReturnType<typeof composeBriefWithRepair>>;
  try {
    composed = await composeBriefWithRepair(
    async (correctiveAddendum) => {
      const system = correctiveAddendum
        ? `${systemPrompt}\n\n${correctiveAddendum}`
        : systemPrompt;

      let messages: Array<{ role: string; content: unknown }> = [
        { role: "user", content: COMPOSE_USER_MESSAGE },
      ];
      let inputTokens = 0;
      let outputTokens = 0;

      for (let call = 0; ; call++) {
        const json = await callOnce(system, messages);
        inputTokens += json.usage?.input_tokens ?? 0;
        outputTokens += json.usage?.output_tokens ?? 0;
        totalInputTokens += json.usage?.input_tokens ?? 0;
        totalOutputTokens += json.usage?.output_tokens ?? 0;
        totalWebSearches += countWebSearches(json.usage);

        if (
          json.stop_reason === "pause_turn" &&
          call < MAX_PAUSE_CONTINUATIONS &&
          // CAD-224 #4: past the compose deadline, stop continuing — the
          // partial text falls through to the parser; the retry is gated
          // on the same deadline, so the compose ends here rather than
          // running the route out of wall-clock.
          Date.now() < composeDeadlineAtMs
        ) {
          // Documented continuation: pass the paused assistant turn back
          // verbatim and re-POST. Not a retry — same turn, resumed.
          messages = [
            ...messages,
            { role: "assistant", content: json.content ?? [] },
          ];
          continue;
        }

        return {
          text: extractAssistantText(json.content),
          inputTokens,
          outputTokens,
        };
      }
    },
      {
        modelId: PRO_COMPOSER_MODEL_ID,
        digestRunId: input.digestRunId ?? null,
        // CAD-224 #4: same wall-clock deadline that gates pause_turn
        // continuations above — once it passes, no corrective retry.
        retryDeadlineAtMs: composeDeadlineAtMs,
      }
    );
  } catch (err) {
    // Review P1-5: the API calls succeeded and the web searches were
    // billed even though the output never validated — record the spend
    // before rethrowing so the cost cap and margin telemetry see it.
    // recordCost itself never throws (best-effort by design).
    await recordCost({
      userId: input.userId ?? null,
      digestRunId: input.digestRunId ?? null,
      kind: "llm_call",
      provider: "anthropic_websearch",
      model: PRO_COMPOSER_MODEL_ID,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: anthropicWebSearchCostUsd(
        PRO_COMPOSER_MODEL_ID,
        totalInputTokens,
        totalOutputTokens,
        totalWebSearches
      ),
    });
    throw err;
  }

  const markdown = renderBriefMarkdown(composed.brief);

  // Token cost is linear so summed counts in one row stay dollar-exact;
  // the search surcharge rides the same row (provider-attributable).
  const costUsd = anthropicWebSearchCostUsd(
    PRO_COMPOSER_MODEL_ID,
    composed.inputTokens,
    composed.outputTokens,
    totalWebSearches
  );

  await recordCost({
    userId: input.userId ?? null,
    digestRunId: input.digestRunId ?? null,
    kind: "llm_call",
    provider: "anthropic_websearch",
    model: PRO_COMPOSER_MODEL_ID,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    costUsd,
  });

  return {
    markdown,
    modelId: PRO_COMPOSER_MODEL_ID,
    inputTokens: composed.inputTokens,
    outputTokens: composed.outputTokens,
    costUsd,
    brief: composed.brief,
    repair: composed.repair,
  };
}

// ---------------------------------------------------------------------------
// ComposerProvider wrapper
// ---------------------------------------------------------------------------

export const webSearchComposerProvider: ComposerProvider = {
  id: "anthropic-sonnet-websearch",
  modelId: PRO_COMPOSER_MODEL_ID,
  async compose(input: ComposerInput): Promise<ComposerOutput> {
    return composeDigestWebSearch(input);
  },
};
