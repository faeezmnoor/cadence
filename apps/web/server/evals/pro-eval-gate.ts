/**
 * CAD-90 (Phase 5.1 Pro Tier) / CAD-225 reframe: eval gate readiness helper.
 *
 * Aggregates the last 7 days of manually-rated digest runs (the rating lives
 * in `digest_runs.metadata.manualRating`, written by admin.rateBrief — Evals
 * Phase 0) and decides whether the advanced tier has accumulated enough
 * signal to be flipped on for everyone.
 *
 * WHY the criterion changed (CAD-225, founder-approved 2026-06-14):
 *   A 5-iteration eval with an INFORMED judge proved grounding ~2.3 is the
 *   judge's FLOOR for niche Malaysian topics — the standard tier already
 *   grounds ~2.4, and NO advanced stack clears a grounding bar on these
 *   topics (it's a property of the topic's source scarcity, not the stack).
 *   Gating on grounding therefore gated on noise. The advanced tier's real,
 *   measurable value is SPECIFICITY (+0.6) and FIT (+0.3) — so the gate now
 *   rewards those axes and DROPS grounding as a hard bar entirely.
 *
 * Readiness rule (the cheap pre-filter; see "authority" note below):
 *   - >=5 advanced-tier ratings in the window, AND
 *   - >=5 default-tier ratings in the window, AND
 *   - composite lead (advanced − default) >= MIN_LEAD (0.25), AND
 *   - advanced specificity avg >= MIN_ADVANCED_SPECIFICITY (3.7) — the axis
 *     where advanced genuinely wins; advanced must be MEASURABLY more
 *     specific, not merely composite-ahead on grounding noise.
 *   - grounding is NO LONGER a hard bar (no stack clears it on these topics).
 *
 * Composite = (grounding + specificity + fit) / 3 — same axes the admin
 * rateBrief mutation persists. Grounding still feeds the composite (so a
 * grounding collapse would still drag the lead down), it's just not its own
 * pass/fail gate.
 *
 * AUTHORITY: this helper is the cheap, observational PRE-FILTER. It does NOT
 * flip any flags. Faeez's manual /admin ratings remain the FINAL authority on
 * when the advanced tier un-pauses; /admin/evals surfaces this verdict so he
 * decides when to ship.
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { isAdvancedStack, normalizeStack } from "@/lib/research-stack";

export type EvalGateMetrics = {
  proCount: number;
  defaultCount: number;
  proCompositeAvg: number | null;
  defaultCompositeAvg: number | null;
  proAxes: { grounding: number; specificity: number; fit: number } | null;
  defaultAxes: { grounding: number; specificity: number; fit: number } | null;
  lead: number | null;
};

export type EvalGateReason =
  | "ready"
  | "insufficient_pro"
  | "insufficient_default"
  | "lead_below_threshold"
  | "specificity_below_threshold"
  | "no_data";

export type EvalGateResult = {
  ready: boolean;
  reason: EvalGateReason;
  metrics: EvalGateMetrics;
};

export const MIN_SAMPLES_PER_TIER = 5;
/**
 * CAD-225: lowered 0.5 → 0.25. With grounding (the topic-floored axis) no
 * longer a hard bar, the advanced tier's composite lead is carried by
 * specificity + fit alone, so a smaller composite lead is meaningful — but
 * it MUST be paired with the specificity bar below (composite-ahead on
 * grounding noise without a specificity win does NOT pass).
 */
export const MIN_LEAD = 0.25;
/**
 * CAD-225: the specificity floor the advanced tier must clear. Specificity
 * (+0.6 in the eval) is the axis where advanced genuinely wins; gating on it
 * directly — not just via the composite — is what makes the lead trustworthy.
 */
export const MIN_ADVANCED_SPECIFICITY = 3.7;
export const WINDOW_DAYS = 7;

type AggRow = {
  tier: string;
  n: string | number;
  avg_g: string | number | null;
  avg_s: string | number | null;
  avg_f: string | number | null;
};

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function round(n: number | null, places = 3): number | null {
  if (n === null) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export async function proTierAlphaReady(): Promise<EvalGateResult> {
  /**
   * Join digest_runs -> digest_specs on spec_id so we can group by tier.
   * Filter:
   *   - metadata->'manualRating' IS NOT NULL  (only rated runs count)
   *   - rated within the last WINDOW_DAYS days (using ratedAt from the
   *     rating payload — that's the human signal, not the run creation
   *     timestamp).
   */
  const rows = (await db.execute<AggRow>(sql`
    SELECT
      ds.tier AS tier,
      COUNT(*) AS n,
      AVG((dr.metadata->'manualRating'->>'grounding')::numeric)   AS avg_g,
      AVG((dr.metadata->'manualRating'->>'specificity')::numeric) AS avg_s,
      AVG((dr.metadata->'manualRating'->>'fit')::numeric)         AS avg_f
    FROM digest_runs dr
    INNER JOIN digest_specs ds ON ds.id = dr.spec_id
    WHERE dr.metadata ? 'manualRating'
      AND dr.metadata->'manualRating'->>'ratedAt' IS NOT NULL
      AND (dr.metadata->'manualRating'->>'ratedAt')::timestamptz
            >= now() - (${WINDOW_DAYS} || ' days')::interval
    GROUP BY ds.tier
  `)) as unknown as AggRow[];

  // CTO P1 (CAD-225): bucket the ADVANCED arm by isAdvancedStack, not the
  // literal "pro" string — migration 0028 retired "pro", and the live
  // advanced stack is "pro_websearch". Aggregate every advanced tier into
  // one arm with count-weighted axis means so the gate keeps working as
  // stacks evolve. Rows whose tier normalizes to "default" are the
  // baseline arm.
  let proCount = 0;
  let defaultCount = 0;
  // Count-weighted axis accumulators (sum of axis*n) per arm.
  const acc = {
    pro: { g: 0, s: 0, f: 0, n: 0 },
    def: { g: 0, s: 0, f: 0, n: 0 },
  };

  for (const r of rows) {
    const n = num(r.n) ?? 0;
    const g = num(r.avg_g);
    const s = num(r.avg_s);
    const f = num(r.avg_f);
    if (n === 0) continue;
    const advanced = isAdvancedStack(normalizeStack(r.tier));
    const bucket = advanced ? acc.pro : acc.def;
    if (advanced) proCount += n;
    else defaultCount += n;
    if (g !== null && s !== null && f !== null) {
      bucket.g += g * n;
      bucket.s += s * n;
      bucket.f += f * n;
      bucket.n += n;
    }
  }

  const axesOf = (b: { g: number; s: number; f: number; n: number }) =>
    b.n > 0
      ? {
          grounding: round(b.g / b.n, 3)!,
          specificity: round(b.s / b.n, 3)!,
          fit: round(b.f / b.n, 3)!,
        }
      : null;
  const proAxes: EvalGateMetrics["proAxes"] = axesOf(acc.pro);
  const defaultAxes: EvalGateMetrics["defaultAxes"] = axesOf(acc.def);

  const proCompositeAvg =
    proAxes !== null
      ? round((proAxes.grounding + proAxes.specificity + proAxes.fit) / 3, 3)
      : null;
  const defaultCompositeAvg =
    defaultAxes !== null
      ? round(
          (defaultAxes.grounding + defaultAxes.specificity + defaultAxes.fit) /
            3,
          3
        )
      : null;
  const lead =
    proCompositeAvg !== null && defaultCompositeAvg !== null
      ? round(proCompositeAvg - defaultCompositeAvg, 3)
      : null;

  const metrics: EvalGateMetrics = {
    proCount,
    defaultCount,
    proCompositeAvg,
    defaultCompositeAvg,
    proAxes,
    defaultAxes,
    lead,
  };

  if (proCount === 0 && defaultCount === 0) {
    return { ready: false, reason: "no_data", metrics };
  }
  if (proCount < MIN_SAMPLES_PER_TIER) {
    return { ready: false, reason: "insufficient_pro", metrics };
  }
  if (defaultCount < MIN_SAMPLES_PER_TIER) {
    return { ready: false, reason: "insufficient_default", metrics };
  }
  // CAD-225 criterion (both bars must clear; grounding is NOT gated):
  //   (a) composite lead >= MIN_LEAD (0.25), AND
  //   (b) advanced specificity avg >= MIN_ADVANCED_SPECIFICITY (3.7).
  // Order is deliberate: report the lead failure first (it's the headline
  // verdict), then the specificity failure for a composite-passing tier that
  // isn't actually more specific.
  if (lead === null || lead < MIN_LEAD) {
    return { ready: false, reason: "lead_below_threshold", metrics };
  }
  if (
    proAxes === null ||
    proAxes.specificity < MIN_ADVANCED_SPECIFICITY
  ) {
    return { ready: false, reason: "specificity_below_threshold", metrics };
  }
  return { ready: true, reason: "ready", metrics };
}

export type RecentRating = {
  runId: string;
  tier: string;
  composite: number;
  grounding: number;
  specificity: number;
  fit: number;
  ratedAt: string;
  ratedBy: string;
};

type RecentRow = {
  run_id: string;
  tier: string;
  grounding: string | number;
  specificity: string | number;
  fit: string | number;
  rated_at: string;
  rated_by: string | null;
};

/**
 * Last N manually-rated briefs, newest first. Drives the side-panel list on
 * /admin/evals so we can spot-check what's driving the verdict.
 */
export async function recentRatedBriefs(limit = 10): Promise<RecentRating[]> {
  const rows = (await db.execute<RecentRow>(sql`
    SELECT
      dr.id AS run_id,
      ds.tier AS tier,
      (dr.metadata->'manualRating'->>'grounding')::numeric   AS grounding,
      (dr.metadata->'manualRating'->>'specificity')::numeric AS specificity,
      (dr.metadata->'manualRating'->>'fit')::numeric         AS fit,
      dr.metadata->'manualRating'->>'ratedAt'                AS rated_at,
      dr.metadata->'manualRating'->>'ratedBy'                AS rated_by
    FROM digest_runs dr
    INNER JOIN digest_specs ds ON ds.id = dr.spec_id
    WHERE dr.metadata ? 'manualRating'
      AND dr.metadata->'manualRating'->>'ratedAt' IS NOT NULL
    ORDER BY (dr.metadata->'manualRating'->>'ratedAt')::timestamptz DESC
    LIMIT ${limit}
  `)) as unknown as RecentRow[];

  return rows.map((r) => {
    const g = Number(r.grounding);
    const s = Number(r.specificity);
    const f = Number(r.fit);
    return {
      runId: r.run_id,
      tier: r.tier,
      grounding: g,
      specificity: s,
      fit: f,
      composite: Math.round(((g + s + f) / 3) * 100) / 100,
      ratedAt: r.rated_at,
      ratedBy: r.rated_by ?? "admin",
    };
  });
}
