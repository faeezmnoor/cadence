/**
 * Curated starter templates for the /chat composer (Ticket 1).
 *
 * These are the "rails" we expose to guide users to common, well-supported
 * digest shapes. The chat composer itself stays flexible (any spec is
 * acceptable per the UX audit — `sections: min 1`), but a first-time user
 * dropped into a blank chat needs concrete examples of what Cadence can do
 * across categories Faeez wants Cadence to be known for.
 *
 * Editing rules:
 *   - This file is the source of truth — Faeez can add/remove templates and
 *     redeploy. No DB migration, no admin UI required.
 *   - Keep `id` stable: telemetry on /admin/missing-capabilities (Ticket 2)
 *     and topic classification (Ticket 3) compare against `id` and the
 *     keyword set in `match`.
 *   - `exampleQuery` is the literal string that lands in the input field
 *     when the user taps a chip; it must read as a natural first message
 *     ("Daily palm oil price + MPOB news"), NOT as JSON or a command.
 *   - `match` is the keyword list used by classifyTopic() to bucket
 *     incoming spec topics into a template id. Lowercase, no spaces in
 *     individual terms; multi-word match handled via includes() against
 *     the joined spec text.
 *   - Positioning: NEVER mention Telegram/WhatsApp in `label` or
 *     `exampleQuery`. Cadence is channel-agnostic; channel choice happens
 *     at /app/link.
 *
 * suggestedTier:
 *   - "default" — covered by Brave + RSS today (free/lean).
 *   - "pro"     — benefits from Sonar Reasoning Pro (deeper synthesis,
 *                 numerical reasoning, broader source mix). The chat still
 *                 saves these as default unless the user explicitly opts
 *                 in; the field is a hint for future upsell UI.
 */

export type DigestTemplateCategory =
  | "commodity"
  | "travel"
  | "single_equity"
  | "social_commerce"
  | "crypto"
  | "sports"
  | "regulatory"
  | "developer"
  | "real_estate"
  | "government";

export interface DigestTemplate {
  id: string;
  label: string;
  emoji: string;
  exampleQuery: string;
  suggestedTier: "default" | "pro";
  category: DigestTemplateCategory;
  /**
   * Lowercase keyword list used by classifyTopic() to bucket incoming spec
   * topics into this template. A single hit is enough — keep keywords
   * specific (e.g. "palm oil", "mpob") rather than generic ("oil", "news").
   */
  match: readonly string[];
}

export const DIGEST_TEMPLATES: readonly DigestTemplate[] = [
  {
    id: "palm_oil_mpob",
    label: "Palm oil + MPOB news",
    emoji: "🌴",
    exampleQuery: "Daily palm oil price + MPOB news",
    suggestedTier: "default",
    category: "commodity",
    match: ["palm oil", "mpob", "cpo", "fcpo"],
  },
  {
    id: "flight_prices_tokyo",
    label: "Tokyo flight prices",
    emoji: "✈️",
    exampleQuery: "Lowest flight prices to Tokyo, March 2026",
    suggestedTier: "pro",
    category: "travel",
    match: ["flight", "flights", "airfare", "tokyo", "haneda", "narita"],
  },
  {
    id: "maybank_klse",
    label: "Maybank + KLSE",
    emoji: "🏦",
    exampleQuery: "Maybank news + KLSE share price",
    suggestedTier: "default",
    category: "single_equity",
    match: ["maybank", "klse", "bursa", "mbb"],
  },
  {
    id: "tiktok_shop_eu",
    label: "TikTok Shop EU",
    emoji: "🛍️",
    exampleQuery: "Top 3 TikTok Shop EU updates today",
    suggestedTier: "pro",
    category: "social_commerce",
    match: ["tiktok shop", "tiktok", "social commerce", "live commerce"],
  },
  {
    id: "bitcoin_crypto",
    label: "Bitcoin + crypto news",
    emoji: "₿",
    exampleQuery: "Bitcoin price + crypto news",
    suggestedTier: "default",
    category: "crypto",
    match: ["bitcoin", "btc", "ethereum", "eth", "crypto", "cryptocurrency"],
  },
  {
    id: "manu_match_odds",
    label: "Man United match odds",
    emoji: "⚽",
    exampleQuery: "Manchester United next match odds",
    suggestedTier: "pro",
    category: "sports",
    match: ["manchester united", "man united", "manu", "premier league", "epl"],
  },
  {
    id: "lhdn_circulars",
    label: "LHDN circulars",
    emoji: "📜",
    exampleQuery: "LHDN circular updates this week",
    suggestedTier: "default",
    category: "regulatory",
    match: ["lhdn", "tax", "circular", "irb", "inland revenue"],
  },
  {
    id: "oss_releases",
    label: "Top OSS releases",
    emoji: "🧑‍💻",
    exampleQuery: "Top OSS releases on GitHub",
    suggestedTier: "default",
    category: "developer",
    match: ["oss", "open source", "github", "releases", "developer"],
  },
  {
    id: "kl_property_listings",
    label: "KL property listings",
    emoji: "🏠",
    exampleQuery: "Top FT property listings in KL under RM800k",
    suggestedTier: "pro",
    category: "real_estate",
    match: ["property", "listings", "real estate", "kuala lumpur", "kl", "rm800k"],
  },
  {
    id: "eperolehan_tenders",
    label: "ePerolehan IT tenders",
    emoji: "🏛️",
    exampleQuery: "ePerolehan IT tenders this week",
    suggestedTier: "default",
    category: "government",
    match: ["eperolehan", "tender", "tenders", "government", "procurement"],
  },
] as const;

/**
 * Cheap keyword-based topic classification. Returns the matching template
 * id, or null if nothing in the spec text overlaps a template's `match`.
 *
 * Used at digest_runs insert time (Ticket 3) to stamp metadata.specSubmittedTopic
 * so /admin/missing-capabilities can answer "what % of new specs match a
 * template vs are off-template?".
 *
 * Pure / sync / no LLM call by design — runs on every dispatched run and
 * must add zero latency.
 */
export function classifyTopic(input: {
  topics?: string[];
  topicHint?: string;
}): { templateId: string | null; matched: boolean } {
  const haystack = [
    ...(input.topics ?? []),
    input.topicHint ?? "",
  ]
    .join(" \n ")
    .toLowerCase();
  if (!haystack.trim()) return { templateId: null, matched: false };

  for (const tpl of DIGEST_TEMPLATES) {
    for (const keyword of tpl.match) {
      if (haystack.includes(keyword)) {
        return { templateId: tpl.id, matched: true };
      }
    }
  }
  return { templateId: null, matched: false };
}
