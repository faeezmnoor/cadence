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
 * surface is a REGISTRY of stacks, not a binary toggle.
 *
 * CAD-225 (founder ruling 2026-06-14): the "pro" (Perplexity Sonar, A2)
 * stack is RETIRED from the product. An informed-judge eval proved it
 * grounds ~2.0 — WORSE than standard's 2.4 — at 3x the price, so it is
 * strictly dominated. "pro_websearch" (Sonnet with the Anthropic web-search
 * server tool, A3) becomes the SINGLE advanced option. The `ResearchStack`
 * union still carries "pro" so legacy persisted rows + the dev bake-off
 * harness keep type-checking, but it is no longer OFFERED — STACK_ORDER
 * drops it and normalizeStack("pro") now coerces to "default".
 *
 * Persistence values stay backward-compatible with the live
 * `digest_specs.tier` column:
 *   - "default"        → Standard (Brave + Haiku), 1 credit
 *   - "pro"            → RETIRED (Perplexity Sonar A2). Cost kept for
 *                        backward-compat reads only; normalizeStack folds
 *                        it to "default" so a legacy spec bills 1 credit and
 *                        is NOT auto-upgraded to the 5-credit stack.
 *   - "pro_websearch"  → Advanced (Sonnet with the Anthropic web-search
 *                        server tool — bake-off winner 2026-06-11,
 *                        composite 4.13 vs 3.47), 5 credits
 * There is NO cost ceiling on any stack; each stack's credit price is
 * set to cover its measured cost-to-us with margin (founder ruling).
 */
export type ResearchStack = "default" | "pro" | "pro_websearch";

/**
 * Stable display + iteration order: cheapest first. The UI maps over THIS,
 * so "pro" never renders (CAD-225 retired it from the product).
 */
export const STACK_ORDER: readonly ResearchStack[] = [
  "default",
  "pro_websearch",
];

export const STACK_COSTS: Record<ResearchStack, number> = {
  default: 1,
  // CAD-225: kept defined for backward-compat reads of any legacy 'pro' row
  // (creditCostForTier('pro') still resolves 3). The stack is no longer
  // offered; normalizeStack folds 'pro' to 'default' before a spec ever bills.
  pro: 3,
  pro_websearch: 5,
};

/**
 * Coerce a persisted tier string (or anything) to a known, OFFERED stack.
 *
 * CAD-225: "pro" (the retired, dominated A2 stack) now folds to "default" —
 * a legacy pro spec falls back to standard (billed 1 credit), deliberately
 * NOT auto-upgraded to the 5-credit pro_websearch stack. Only "pro_websearch"
 * passes through as advanced.
 */
export function normalizeStack(raw: unknown): ResearchStack {
  return raw === "pro_websearch" ? raw : "default";
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
    // Matches PRO_COMPOSER_MODEL_ID (claude-sonnet-4-5) — review P2-14
    // caught the table promising 4.6 while the code pins 4.5.
    pro: "Claude Sonnet 4.5 — sharper analysis, deeper reasoning",
    pro_websearch: "Claude Sonnet 4.5 — sharper analysis, deeper reasoning",
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
      "Searched pages are folded in and cited like any other numbered source",
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
  // CAD-225: 'pro' is retired from the product (never rendered — STACK_ORDER
  // drops it). Summary kept so the Record type stays exhaustive.
  pro: "Retired research depth — no longer offered.",
  pro_websearch:
    "The writer searches the live web itself while composing, then writes a tighter, more specific brief. Best for high-signal topics.",
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
      // Retired (CAD-225) — unreachable from the product since normalizeStack
      // folds "pro" to "default". Kept for exhaustiveness / legacy callers.
      return "Advanced research";
    case "pro_websearch":
      // CAD-225: the single advanced option — drop the "· live web search"
      // qualifier (it's no longer disambiguating two advanced stacks) and
      // stay vendor-free per COPY_GUIDE.
      return "Advanced research";
    default:
      return "Standard research";
  }
}
