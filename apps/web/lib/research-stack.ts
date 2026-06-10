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

export type ResearchStack = "default" | "pro";

export const STACK_COSTS: Record<ResearchStack, number> = {
  default: 1,
  pro: 3,
};

export interface StackDescriptionRow {
  label: string;
  default: string;
  pro: string;
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
  },
  {
    label: "Composer model",
    default: "Claude Haiku 4.5 — fast, lightweight",
    pro: "Claude Sonnet 4.6 — sharper analysis, 1M context",
  },
  {
    label: "Research depth",
    default: "Single-pass synthesis over retrieved sources",
    pro: "Multi-step reasoning with follow-up source-gathering",
  },
  {
    label: "Citation density",
    default: "Sources cited per section",
    pro: "Stronger inline citations + cross-source corroboration",
  },
  {
    label: "Typical latency",
    default: "~30–60 seconds end-to-end",
    pro: "~60–120 seconds end-to-end",
  },
  {
    label: "Credit cost per brief",
    default: `${STACK_COSTS.default} credit`,
    pro: `${STACK_COSTS.pro} credits`,
  },
];

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
  return stack === "pro" ? "Advanced research" : "Standard research";
}
