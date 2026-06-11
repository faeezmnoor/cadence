/**
 * CAD-203 — research-stack constants + credit-cost math.
 *
 * Single source of truth for the per-brief research-depth configuration
 * surface (Configurable Stack Settings on /briefs/[id] Advanced tab).
 *
 * Per project_cadence_no_tier_plans (Faeez 2026-06-09): Cadence ships NO
 * separate Pro plan. The "advanced stack" is a per-brief configuration
 * toggle that consumes more credits per delivered brief. The internal
 * `digest_specs.tier` enum ("default" | "pro") is the persistence
 * mechanism; the user-facing wording is research depth.
 *
 * STACK_COSTS is the credit price per delivered brief and the canonical
 * link between research depth and billing. STACK_DESCRIPTIONS feeds the
 * transparency table so users can see exactly what they're paying for.
 *
 * `briefsPerDay` mirrors server/trpc/routers/briefs.ts briefsPerDayForRule
 * but inlined client-side to keep the client bundle lean (no server-router
 * import → no db drift). The math is intentionally identical; the cost
 * preview math is unit-tested.
 */
import type { SchedulingRuleV1 } from "./scheduling/rule";

/**
 * CAD-222 / founder ruling 2026-06-11: the per-brief research-depth
 * surface is a REGISTRY of stacks, not a binary toggle. Three options
 * ship at launch; adding a fourth is a data change here (+ provider
 * wiring), not UI surgery. Persistence values stay backward-compatible
 * with the live `digest_specs.tier` column:
 *   - "default"        → Standard (Brave + Haiku), 1 credit
 *   - "pro"            → Advanced · Sonar research (Perplexity Sonar
 *                        Reasoning Pro research memo + Sonnet), 3 credits
 *   - "pro_websearch"  → Advanced · live web search (Sonnet with the
 *                        Anthropic web-search server tool — bake-off
 *                        winner 2026-06-11, composite 4.13 vs 3.47), 5 credits
 * There is NO cost ceiling on any stack; each stack's credit price is
 * set to cover its measured cost-to-us with margin (founder ruling).
 */
export type ResearchStack = "default" | "pro" | "pro_websearch";

/** Stable display + iteration order: cheapest first. */
export const STACK_ORDER: readonly ResearchStack[] = [
  "default",
  "pro",
  "pro_websearch",
];

export const STACK_COSTS: Record<ResearchStack, number> = {
  default: 1,
  pro: 3,
  pro_websearch: 5,
};

/** Coerce a persisted tier string (or anything) to a known stack. */
export function normalizeStack(raw: unknown): ResearchStack {
  return raw === "pro" || raw === "pro_websearch" ? raw : "default";
}

/** True for every stack that is gated behind the advanced alpha flag
 *  and billed above 1 credit. */
export function isAdvancedStack(stack: ResearchStack): boolean {
  return stack !== "default";
}

export interface StackDescriptionRow {
  label: string;
  default: string;
  pro: string;
  pro_websearch: string;
}

/**
 * Transparency table content. Each row compares one dimension between the
 * two stacks. The source of truth for these provider claims is:
 *   - server/ai/providers/default.ts (Claude Haiku 4.5)
 *   - server/ai/providers/anthropic-pro.ts (Claude Sonnet 4.6)
 *   - server/sources/index.ts (Brave/RSS for default; Perplexity Sonar for pro)
 *   - HANDOVER.md §4 (stack table)
 */
export const STACK_DESCRIPTIONS: StackDescriptionRow[] = [
  {
    label: "Search provider",
    default: "Brave Search + curated RSS packs + Playwright scrapers",
    pro: "Perplexity Sonar Reasoning Pro (LLM-driven multi-step web research)",
    pro_websearch:
      "Live web search by the composer itself (Anthropic web-search tool, up to 3 targeted searches)",
  },
  {
    label: "Composer model",
    default: "Claude Haiku 4.5 — fast, lightweight",
    pro: "Claude Sonnet 4.6 — sharper analysis, 1M context",
    pro_websearch: "Claude Sonnet 4.6 — sharper analysis, 1M context",
  },
  {
    label: "Research depth",
    default: "Single-pass synthesis over retrieved sources",
    pro: "Multi-step reasoning with follow-up source-gathering",
    pro_websearch:
      "The composer searches the live web mid-write and folds findings into its sources",
  },
  {
    label: "Citation density",
    default: "Sources cited per section",
    pro: "Stronger inline citations + cross-source corroboration",
    pro_websearch:
      "Strongest fit-to-brief in our evals — searched pages cited like any other source",
  },
  {
    label: "Typical latency",
    default: "~30–60 seconds end-to-end",
    pro: "~60–120 seconds end-to-end",
    pro_websearch: "~60–120 seconds end-to-end",
  },
  {
    label: "Credit cost per brief",
    default: `${STACK_COSTS.default} credit`,
    pro: `${STACK_COSTS.pro} credits`,
    pro_websearch: `${STACK_COSTS.pro_websearch} credits`,
  },
];

/**
 * One-line summary per stack for the option picker (label + price live
 * separately — this is the "what am I buying" sentence).
 */
export const STACK_SUMMARIES: Record<ResearchStack, string> = {
  default:
    "Fast daily signal from curated feeds and search. The right default for most briefs.",
  pro: "A research pass reads the web first and hands the writer a memo. Deeper digging on broad topics.",
  pro_websearch:
    "The writer searches the live web itself while composing. Sharpest fit to your exact brief.",
};

/**
 * Expected briefs-per-day for a scheduling rule. Mirror of
 * server/trpc/routers/briefs.ts briefsPerDayForRule — kept in sync by
 * the unit tests below.
 *
 *   - daily        : (weekdays.length / 7)        [default weekdays = 1..7 → 1.0]
 *   - weekly       : (weekdays.length / 7)
 *   - monthly      : 1 / 30
 *   - custom_cron  : 1 / 7  [conservative; we don't parse cron]
 *
 * `skipWhen.weekends` shaves weekend days off daily/weekly counts.
 * Returns 0 if the scheduling shape is malformed or absent (e.g. brief
 * without a scheduling rule yet).
 */
export function briefsPerDay(scheduling: unknown): number {
  if (!scheduling || typeof scheduling !== "object") return 0;
  const r = scheduling as Partial<SchedulingRuleV1>;
  const c = r.cadence;
  if (!c) return 0;
  const skipWeekends = r.skipWhen?.weekends === true;
  if (c.kind === "daily" || c.kind === "weekly") {
    const wd =
      c.kind === "daily" ? (c.weekdays ?? [1, 2, 3, 4, 5, 6, 7]) : c.weekdays;
    const filtered = skipWeekends ? wd.filter((d) => d <= 5) : wd;
    return filtered.length / 7;
  }
  if (c.kind === "monthly") {
    return 1 / 30;
  }
  if (c.kind === "custom_cron") {
    return 1 / 7;
  }
  return 0;
}

/**
 * Credit cost for the NEXT single delivery at the given research depth.
 * Just STACK_COSTS[stack]; the helper exists so callers can stay declarative.
 */
export function nextDeliveryCost(stack: ResearchStack): number {
  return STACK_COSTS[stack];
}

/**
 * Monthly run-rate credit estimate for a brief at a given research depth.
 * Approximation: (briefsPerDay * 30) * STACK_COSTS[stack], rounded to the
 * nearest credit. Returns 0 if scheduling is unknown.
 *
 * This is the "if you keep this configuration, you'll spend ~N credits/month"
 * preview shown next to the toggle.
 */
export function monthlyCreditEstimate(
  scheduling: unknown,
  stack: ResearchStack
): number {
  const perDay = briefsPerDay(scheduling);
  if (perDay <= 0) return 0;
  return Math.round(perDay * 30 * STACK_COSTS[stack]);
}

/**
 * Human label for a stack, used in headings and badges. No tier nouns
 * per project_cadence_no_tier_plans + CAD-202 copy discipline.
 */
export function stackLabel(stack: ResearchStack): string {
  // Vendor-free per COPY_GUIDE ("vendor names in user copy — fine-print
  // only"). The variant qualifiers reuse the badge-footer phrases.
  switch (stack) {
    case "pro":
      return "Advanced research · deeper digging";
    case "pro_websearch":
      return "Advanced research · live web search";
    default:
      return "Standard research";
  }
}
