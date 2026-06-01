/**
 * T-111: Hand-crafted scenarios for the config-agent eval harness.
 *
 * Each fixture represents a complete config flow: an ordered list of tool
 * calls the agent would make to gather a user's preferences, ending with
 * `confirm_and_save`. The expected final spec is the snapshot we assert
 * against post-save. This deliberately bypasses calling a real LLM —
 * we're testing the *tool plumbing*, not model quality. LLM-driven evals
 * belong in a separate, opt-in suite (not in CI).
 */
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";
import type { ConfigAgentToolName } from "@/server/ai/config-agent/tools";

export type ToolCall =
  | { tool: "propose_spec"; args: { spec: unknown } }
  | { tool: "update_spec_field"; args: { path: string; value: unknown } }
  | { tool: "ask_user"; args: { question: string } }
  | { tool: "add_rss_feed"; args: { url: string; label: string } }
  | { tool: "confirm_and_save"; args: { user_confirmed: boolean } };

export interface Fixture {
  id: string;
  description: string;
  calls: ToolCall[];
  /** What `digest_specs.spec` should look like after a successful save. */
  expected: DigestSpecV1;
}

export const fixtures: Fixture[] = [
  {
    id: "solo-crypto-trader",
    description: "Solo trader wants a daily BTC/ETH brief at 08:00 with prices.",
    calls: [
      {
        tool: "propose_spec",
        args: {
          spec: {
            schema_version: 1,
            topics: ["crypto markets"],
            entities: { tickers: ["BTC-USD", "ETH-USD"], companies: [], commodities: [] },
            data_addons: { show_prices: true, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
            cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] },
            tone_preset: "trader_quick_take",
            length_target: "short",
            language: "en",
          },
        },
      },
      { tool: "confirm_and_save", args: { user_confirmed: true } },
    ],
    expected: {
      schema_version: 1,
      topics: ["crypto markets"],
      entities: { tickers: ["BTC-USD", "ETH-USD"], companies: [], commodities: [] },
      keywords_include: [],
      keywords_exclude: [],
      data_addons: { show_prices: true, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
      rss_feeds: [],
      cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] },
      tone_preset: "trader_quick_take",
      length_target: "short",
      language: "en",
    },
  },
  {
    id: "palm-oil-analyst",
    description: "Palm oil analyst — weekly Monday brief with MPOB RSS feed.",
    calls: [
      {
        tool: "propose_spec",
        args: {
          spec: {
            schema_version: 1,
            topics: ["palm oil", "edible oils"],
            entities: { commodities: ["CPO=F"], companies: ["SDP.KL", "KLK.KL"], tickers: [] },
            cadence: { frequency: "weekly", delivery_time_local: "07:30", days_of_week: [1] },
            tone_preset: "analyst_deep_dive",
            length_target: "long",
            language: "en",
          },
        },
      },
      { tool: "add_rss_feed", args: { url: "https://bepi.mpob.gov.my/feed", label: "MPOB Bulletin" } },
      { tool: "confirm_and_save", args: { user_confirmed: true } },
    ],
    expected: {
      schema_version: 1,
      topics: ["palm oil", "edible oils"],
      entities: { commodities: ["CPO=F"], companies: ["SDP.KL", "KLK.KL"], tickers: [] },
      keywords_include: [],
      keywords_exclude: [],
      data_addons: { show_prices: false, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
      rss_feeds: [{ url: "https://bepi.mpob.gov.my/feed", label: "MPOB Bulletin" }],
      cadence: { frequency: "weekly", delivery_time_local: "07:30", days_of_week: [1] },
      tone_preset: "analyst_deep_dive",
      length_target: "long",
      language: "en",
    },
  },
  {
    id: "b2b-saas-founder",
    description: "Founder wants competitor watch with exclude noise. Default cadence.",
    calls: [
      {
        tool: "propose_spec",
        args: {
          spec: {
            schema_version: 1,
            topics: ["customer engagement platforms", "AI workflow tools"],
            entities: { companies: ["Klaviyo", "Bambuser", "Whatnot"], tickers: [], commodities: [] },
            keywords_include: ["roadmap", "pricing change", "funding"],
            keywords_exclude: ["hiring", "stock grant", "RSU"],
            cadence: { frequency: "daily", delivery_time_local: "09:00", days_of_week: [1, 2, 3, 4, 5] },
            tone_preset: "executive_brief",
            length_target: "medium",
            language: "en",
          },
        },
      },
      { tool: "confirm_and_save", args: { user_confirmed: true } },
    ],
    expected: {
      schema_version: 1,
      topics: ["customer engagement platforms", "AI workflow tools"],
      entities: { companies: ["Klaviyo", "Bambuser", "Whatnot"], tickers: [], commodities: [] },
      keywords_include: ["roadmap", "pricing change", "funding"],
      keywords_exclude: ["hiring", "stock grant", "RSU"],
      data_addons: { show_prices: false, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
      rss_feeds: [],
      cadence: { frequency: "daily", delivery_time_local: "09:00", days_of_week: [1, 2, 3, 4, 5] },
      tone_preset: "executive_brief",
      length_target: "medium",
      language: "en",
    },
  },
  {
    id: "bilingual-malay-reader",
    description: "Malay-language brief, KL-centric news, with FX pair.",
    calls: [
      {
        tool: "propose_spec",
        args: {
          spec: {
            schema_version: 1,
            topics: ["bursa malaysia", "ekonomi malaysia"],
            entities: { tickers: [], companies: ["MAYBANK.KL", "TENAGA.KL"], commodities: [] },
            data_addons: { show_prices: true, show_24h_change: true, show_7d_change: true, fx_pairs: ["MYR/USD", "MYR/SGD"] },
            cadence: { frequency: "daily", delivery_time_local: "07:00", days_of_week: [1, 2, 3, 4, 5] },
            tone_preset: "casual_newsletter",
            length_target: "medium",
            language: "ms",
          },
        },
      },
      { tool: "confirm_and_save", args: { user_confirmed: true } },
    ],
    expected: {
      schema_version: 1,
      topics: ["bursa malaysia", "ekonomi malaysia"],
      entities: { tickers: [], companies: ["MAYBANK.KL", "TENAGA.KL"], commodities: [] },
      keywords_include: [],
      keywords_exclude: [],
      data_addons: { show_prices: true, show_24h_change: true, show_7d_change: true, fx_pairs: ["MYR/USD", "MYR/SGD"] },
      rss_feeds: [],
      cadence: { frequency: "daily", delivery_time_local: "07:00", days_of_week: [1, 2, 3, 4, 5] },
      tone_preset: "casual_newsletter",
      length_target: "medium",
      language: "ms",
    },
  },
  {
    id: "incremental-build",
    description: "Tests update_spec_field path — propose minimal, then mutate via path writes.",
    calls: [
      {
        tool: "propose_spec",
        args: {
          spec: {
            schema_version: 1,
            topics: ["AI agents"],
            cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5] },
          },
        },
      },
      { tool: "update_spec_field", args: { path: "entities", value: { companies: ["Anthropic", "OpenAI"], tickers: [], commodities: [] } } },
      { tool: "update_spec_field", args: { path: "language", value: "en" } },
      { tool: "update_spec_field", args: { path: "tone_preset", value: "analyst_deep_dive" } },
      { tool: "confirm_and_save", args: { user_confirmed: true } },
    ],
    expected: {
      schema_version: 1,
      topics: ["AI agents"],
      entities: { companies: ["Anthropic", "OpenAI"], tickers: [], commodities: [] },
      keywords_include: [],
      keywords_exclude: [],
      data_addons: { show_prices: false, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
      rss_feeds: [],
      cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5] },
      tone_preset: "analyst_deep_dive",
      length_target: "short",
      language: "en",
    },
  },
];

export const TOOL_NAMES = ["propose_spec", "update_spec_field", "ask_user", "add_rss_feed", "confirm_and_save"] satisfies readonly ConfigAgentToolName[];
