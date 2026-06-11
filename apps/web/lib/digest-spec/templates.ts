/**
 * Curated brief catalog for the /chat composer.
 *
 * Re-curated 2026-06-11 (brief-creation revamp PR 1, proposals/
 * brief-creation-flow-proposal.md). The 10-pill cloud is replaced by:
 *   - 3 starter cards on turn 0 (`starter: true`), one per anchor ICP
 *     (commodities, regulation/tax, competitors), and
 *   - a "Browse all briefs" surface (PR 3) showing every `visible` row
 *     grouped by category.
 *
 * THE `visible` FLAG — read this before editing:
 *   - `visible: true`  → the row renders as a card. A card is a promise:
 *     only GA-clean briefs the stack can deliver today may be visible.
 *     COPY_GUIDE §2 exclusion list (flights, hotels, equity depth, sports
 *     betting, gov tenders, crypto) must NEVER be visible.
 *   - `visible: false` → internal catalog row. Keeps `id` + `match` alive
 *     for classifyTopic() telemetry (/admin/missing-capabilities) and
 *     records the end-to-end vision catalog (Soon/Later briefs) without
 *     making UI promises. Retired pills also live here — ids are
 *     telemetry-load-bearing, do not delete or rename them.
 *
 * Editing rules:
 *   - This file is the source of truth — Faeez edits and redeploys. No DB
 *     migration, no admin UI.
 *   - Keep `id` stable: telemetry on /admin/missing-capabilities and
 *     classifyTopic() compare against `id` and `match`.
 *   - `exampleQuery` is auto-submitted as the user's first message when a
 *     card is tapped; it must read as a natural first message AND must not
 *     trip detectMultiTopic() (no 3+ comma/and-separated short phrases —
 *     test/template-catalog.test.ts asserts this for visible rows).
 *   - `label`: noun phrase, ≤4 words, ends in "brief" or "watch".
 *   - `description`: ≤10 words, what lands in your hands. No channel, no
 *     research-depth ("Pro") language. Named regulators (MPOB, LHDN) are
 *     recognition triggers, allowed; source-dumps ("Reuters, RSS") are not.
 *   - `exampleHeadline`: illustrative only — the UI renders it behind an
 *     "e.g. —" prefix. Never present it as a live fact.
 *   - The cadence hint on cards renders from `seedHints.cadence` via
 *     formatCadenceHint() — never hardcode a second cadence string.
 *   - Positioning: NEVER mention Telegram/WhatsApp in any user-facing
 *     field. Cadence is channel-agnostic; channel choice happens at
 *     /app/link.
 *
 * suggestedTier:
 *   - "default" — covered by Brave + RSS today (free/lean).
 *   - "pro"     — benefits from deeper synthesis. The chat still saves
 *                 these as default unless the user explicitly opts in;
 *                 the field is a hint for future upsell UI.
 */
import type { DigestSpecDraft } from "./schema";

export type DigestTemplateCategory =
  // GA catalog — the three visible sections, one per anchor ICP.
  | "markets_commodities"
  | "regulation_tax"
  | "competitors_companies"
  // Legacy buckets retained on retired rows for telemetry continuity.
  | "travel"
  | "single_equity"
  | "social_commerce"
  | "crypto"
  | "sports"
  | "developer"
  | "real_estate"
  | "government";

/** User-facing section labels (UX-writer vetted, sentence case, no emoji). */
export const TEMPLATE_CATEGORY_LABELS: Partial<
  Record<DigestTemplateCategory, string>
> = {
  markets_commodities: "Markets & commodities",
  regulation_tax: "Regulation & tax",
  competitors_companies: "Competitors & companies",
};

/** Display order of visible sections in the "Browse all briefs" surface. */
export const VISIBLE_CATEGORY_ORDER = [
  "markets_commodities",
  "regulation_tax",
  "competitors_companies",
] as const satisfies readonly DigestTemplateCategory[];

export interface DigestTemplate {
  id: string;
  label: string;
  emoji: string;
  exampleQuery: string;
  suggestedTier: "default" | "pro";
  category: DigestTemplateCategory;
  /** ≤10-word value line shown on the card. Empty string on retired rows. */
  description: string;
  /** See the `visible` flag doc at the top of this file. */
  visible: boolean;
  /** Turn-0 starter card (exactly 3 rows, all `visible: true`). */
  starter?: boolean;
  /** Illustrative headline; UI renders it behind an "e.g. —" prefix. */
  exampleHeadline?: string;
  /**
   * Draft-shaped hints for this brief. PR 1 uses `cadence` to render the
   * card's cadence hint; PR 2 injects the full object into the config
   * agent's prior-context block after a card tap. Must validate against
   * digestSpecDraftSchema (test/template-catalog.test.ts).
   */
  seedHints?: Partial<DigestSpecDraft>;
  /**
   * Lowercase keyword list used by classifyTopic() to bucket incoming spec
   * topics into this template. A single hit is enough — keep keywords
   * specific (e.g. "palm oil", "mpob") rather than generic ("oil", "news").
   */
  match: readonly string[];
}

// Typed against the draft schema (not `as const`): seedHints is a
// Partial<DigestSpecDraft>, whose cadence.days_of_week is a mutable
// number[] — a readonly tuple from `as const` fails assignment.
const WEEKDAY_MORNINGS: NonNullable<DigestSpecDraft["cadence"]> = {
  frequency: "daily",
  delivery_time_local: "07:30",
  days_of_week: [1, 2, 3, 4, 5],
};

const WEEKLY_MONDAY: NonNullable<DigestSpecDraft["cadence"]> = {
  frequency: "weekly",
  delivery_time_local: "08:00",
  days_of_week: [1],
};

export const DIGEST_TEMPLATES: readonly DigestTemplate[] = [
  // -------------------------------------------------------------------
  // Markets & commodities (ICP-1, lead section)
  // -------------------------------------------------------------------
  {
    id: "palm_oil_mpob",
    label: "Palm oil market brief",
    emoji: "🌴",
    exampleQuery: "Daily palm oil prices and MPOB news",
    suggestedTier: "default",
    category: "markets_commodities",
    description: "MPOB stocks, USDA data and futures moves, explained",
    visible: true,
    starter: true,
    exampleHeadline: "CPO futures tighten as MPOB stocks fall",
    seedHints: { cadence: WEEKDAY_MORNINGS },
    match: ["palm oil", "mpob", "cpo", "fcpo"],
  },
  {
    id: "multi_commodity_weekly",
    label: "Multi-commodity weekly brief",
    emoji: "🌾",
    exampleQuery: "Weekly brief on the agricultural commodity prices I buy",
    suggestedTier: "default",
    category: "markets_commodities",
    description: "Corn, wheat and sugar moves in one weekly read",
    visible: true,
    exampleHeadline: "Wheat slips as harvest outlook improves",
    seedHints: { cadence: WEEKLY_MONDAY },
    match: [
      "corn",
      "wheat",
      "sugar",
      "soybean",
      "commodities",
      "commodity prices",
      "grain",
    ],
  },
  {
    id: "fnb_cost_watch",
    label: "F&B cost watch",
    emoji: "🍗",
    exampleQuery: "Weekly brief on ingredient costs for my F&B business",
    suggestedTier: "default",
    category: "markets_commodities",
    description: "Chicken, cooking oil and sugar price pressure, summarized",
    visible: true,
    exampleHeadline: "Cooking oil costs ease after export quota lift",
    seedHints: { cadence: WEEKLY_MONDAY },
    match: ["chicken", "cooking oil", "f&b", "fnb", "ingredient", "food cost"],
  },

  // -------------------------------------------------------------------
  // Regulation & tax (ICP-2/3)
  // -------------------------------------------------------------------
  {
    id: "regulation_watch",
    label: "Regulation watch",
    emoji: "🏛️",
    exampleQuery: "Weekly brief on regulation changes affecting my industry",
    suggestedTier: "default",
    category: "regulation_tax",
    description: "Rule changes in your sector, before they bite",
    visible: true,
    exampleHeadline: "New e-invoicing phase covers smaller firms from August",
    seedHints: { cadence: WEEKLY_MONDAY },
    // NB: no "ruling" here — it would shadow lhdn_circulars ("tax rulings")
    // in classifyTopic's first-hit scan (this row sorts earlier).
    match: ["regulation", "regulatory", "compliance", "e-invoicing"],
  },
  {
    id: "lhdn_circulars",
    label: "Tax and LHDN watch",
    emoji: "🧾",
    exampleQuery: "Weekly brief on LHDN circulars and tax rulings",
    suggestedTier: "default",
    category: "regulation_tax",
    description: "New rulings and circulars before your clients ask",
    visible: true,
    starter: true,
    exampleHeadline: "LHDN clarifies capital allowance claims for SMEs",
    seedHints: { cadence: WEEKLY_MONDAY },
    match: ["lhdn", "tax", "circular", "irb", "inland revenue"],
  },

  // -------------------------------------------------------------------
  // Competitors & companies (ICP-2/4/5)
  // -------------------------------------------------------------------
  {
    id: "competitor_watch",
    label: "Competitor watch",
    emoji: "🔭",
    exampleQuery:
      "Weekly brief on my competitors — launches, pricing changes and hiring moves",
    suggestedTier: "default",
    category: "competitors_companies",
    description: "Launches, pricing changes and hiring moves at your rivals",
    visible: true,
    starter: true,
    exampleHeadline: "Rival cuts entry pricing ahead of quarter close",
    seedHints: { cadence: WEEKLY_MONDAY },
    match: ["competitor", "competitors", "rival", "rivals"],
  },
  {
    id: "target_account_watch",
    label: "Target-account watch",
    emoji: "🎯",
    exampleQuery: "Weekly brief on news about my target accounts",
    suggestedTier: "default",
    category: "competitors_companies",
    description: "Signals from the accounts you want to win",
    visible: true,
    exampleHeadline: "Key account announces regional expansion plan",
    seedHints: { cadence: WEEKLY_MONDAY },
    match: ["target account", "target accounts", "prospects", "key account"],
  },

  // -------------------------------------------------------------------
  // Internal catalog — Soon/Later (vision coverage, no UI presence yet).
  // Flip `visible` only when the stack can deliver AND the brief clears
  // the COPY_GUIDE §2 exclusion list.
  // -------------------------------------------------------------------
  {
    id: "commodity_price_depth",
    label: "Commodity price brief",
    emoji: "📊",
    exampleQuery: "Daily commodity price brief with futures data",
    suggestedTier: "pro",
    category: "markets_commodities",
    description: "Futures curves and price depth, explained",
    visible: false, // Later (Phase 6, Twelve Data)
    match: ["futures", "price depth", "twelve data"],
  },
  {
    id: "caselaw_watch",
    label: "Case-law watch",
    emoji: "⚖️",
    exampleQuery: "Weekly brief on new court decisions in my practice area",
    suggestedTier: "pro",
    category: "regulation_tax",
    description: "New decisions in your practice area",
    visible: false, // Later — agent fallback handles these requests today
    match: ["case law", "caselaw", "court", "judgment", "federal court"],
  },
  {
    id: "clinical_research_watch",
    label: "Clinical research watch",
    emoji: "🩺",
    exampleQuery: "Weekly brief on clinical research in my specialty",
    suggestedTier: "pro",
    category: "regulation_tax",
    description: "New studies and guidance in your specialty",
    visible: false, // Later — agent fallback handles these requests today
    match: ["clinical", "medical research", "trials", "guideline"],
  },
  {
    id: "beat_tracking_brief",
    label: "Beat-tracking brief",
    emoji: "📰",
    exampleQuery: "Daily brief on stories breaking on my beat",
    suggestedTier: "default",
    category: "competitors_companies",
    description: "What broke on your beat overnight",
    visible: false, // Soon (after RSS handling lift)
    match: ["beat", "journalist", "newsroom", "press"],
  },
  {
    id: "premeeting_account_brief",
    label: "Pre-meeting account brief",
    emoji: "🤝",
    exampleQuery: "Brief me on a company before my meeting",
    suggestedTier: "pro",
    category: "competitors_companies",
    description: "One company, read before you walk in",
    visible: false, // Later — on-demand cadence not in schema
    match: ["pre-meeting", "meeting prep", "account brief"],
  },
  {
    id: "hiring_exec_moves",
    label: "Hiring signals watch",
    emoji: "🧑‍💼",
    exampleQuery: "Weekly brief on hiring and exec moves at companies I watch",
    suggestedTier: "pro",
    category: "competitors_companies",
    description: "Hiring spikes and exec moves at watched companies",
    visible: false, // Later — LinkedIn-gated
    match: ["hiring", "exec moves", "headcount", "appointments"],
  },

  // -------------------------------------------------------------------
  // Retired pills (2026-06-11). COPY_GUIDE §2 exclusion list or off-ICP.
  // Ids + match stay for classifyTopic() / missing-capabilities telemetry.
  // NEVER flip these back to visible (anti-catalog: flights, hotels,
  // sports betting, crypto, equity depth, collectibles, paywalled).
  // -------------------------------------------------------------------
  {
    id: "flight_prices_tokyo",
    label: "Tokyo flight prices",
    emoji: "✈️",
    exampleQuery: "Lowest flight prices to Tokyo, March 2026",
    suggestedTier: "pro",
    category: "travel",
    description: "",
    visible: false,
    match: ["flight", "flights", "airfare", "tokyo", "haneda", "narita"],
  },
  {
    id: "maybank_klse",
    label: "Maybank + KLSE",
    emoji: "🏦",
    exampleQuery: "Maybank news + KLSE share price",
    suggestedTier: "default",
    category: "single_equity",
    description: "",
    visible: false,
    match: ["maybank", "klse", "bursa", "mbb"],
  },
  {
    id: "tiktok_shop_eu",
    label: "TikTok Shop EU",
    emoji: "🛍️",
    exampleQuery: "Top 3 TikTok Shop EU updates today",
    suggestedTier: "pro",
    category: "social_commerce",
    description: "",
    visible: false,
    match: ["tiktok shop", "tiktok", "social commerce", "live commerce"],
  },
  {
    id: "bitcoin_crypto",
    label: "Bitcoin + crypto news",
    emoji: "₿",
    exampleQuery: "Bitcoin price + crypto news",
    suggestedTier: "default",
    category: "crypto",
    description: "",
    visible: false,
    match: ["bitcoin", "btc", "ethereum", "eth", "crypto", "cryptocurrency"],
  },
  {
    id: "manu_match_odds",
    label: "Man United match odds",
    emoji: "⚽",
    exampleQuery: "Manchester United next match odds",
    suggestedTier: "pro",
    category: "sports",
    description: "",
    visible: false,
    match: ["manchester united", "man united", "manu", "premier league", "epl"],
  },
  {
    id: "oss_releases",
    label: "Top OSS releases",
    emoji: "🧑‍💻",
    exampleQuery: "Top OSS releases on GitHub",
    suggestedTier: "default",
    category: "developer",
    description: "",
    visible: false,
    match: ["oss", "open source", "github", "releases", "developer"],
  },
  {
    id: "kl_property_listings",
    label: "KL property listings",
    emoji: "🏠",
    exampleQuery: "Top FT property listings in KL under RM800k",
    suggestedTier: "pro",
    category: "real_estate",
    description: "",
    visible: false,
    match: ["property", "listings", "real estate", "kuala lumpur", "kl", "rm800k"],
  },
  {
    id: "eperolehan_tenders",
    label: "ePerolehan IT tenders",
    emoji: "🏛️",
    exampleQuery: "ePerolehan IT tenders this week",
    suggestedTier: "default",
    category: "government",
    description: "",
    visible: false, // Later (Phase 6 validation; highest WTP — off UI until validated)
    match: ["eperolehan", "tender", "tenders", "government", "procurement"],
  },
] as const;

/** Rows that may render as cards anywhere in the UI. */
export const VISIBLE_TEMPLATES: readonly DigestTemplate[] =
  DIGEST_TEMPLATES.filter((t) => t.visible);

/** The 3 turn-0 starter cards (one per anchor ICP). */
export const STARTER_TEMPLATES: readonly DigestTemplate[] =
  DIGEST_TEMPLATES.filter((t) => t.visible && t.starter === true);

/** Set of known template ids — used to validate client-supplied ids. */
export function isKnownTemplateId(id: unknown): id is string {
  return (
    typeof id === "string" && DIGEST_TEMPLATES.some((t) => t.id === id)
  );
}

/**
 * Render the card's cadence hint from seedHints.cadence — the single
 * source so the card never carries a second hardcoded cadence string.
 * Pure; falls back to "" when there's nothing to say.
 */
export function formatCadenceHint(
  cadence?: Partial<DigestSpecDraft>["cadence"]
): string {
  if (!cadence?.frequency) return "";
  const hour = Number((cadence.delivery_time_local ?? "08:00").slice(0, 2));
  const morning = hour < 12;
  if (cadence.frequency === "weekly") return "Weekly";
  if (cadence.frequency === "monthly") return "Monthly";
  // daily
  const days = cadence.days_of_week ?? [];
  const weekdaysOnly =
    days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
  if (weekdaysOnly) {
    return morning ? "Daily, weekday mornings" : "Daily, weekdays";
  }
  return morning ? "Every morning" : "Daily";
}

/**
 * Cheap keyword-based topic classification. Returns the matching template
 * id, or null if nothing in the spec text overlaps a template's `match`.
 *
 * Used at digest_runs insert time (Ticket 3) to stamp metadata.specSubmittedTopic
 * so /admin/missing-capabilities can answer "what % of new specs match a
 * template vs are off-template?". Scans ALL rows (visible or not) — retired
 * and Soon/Later rows are exactly the demand signal that page exists to
 * catch.
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
