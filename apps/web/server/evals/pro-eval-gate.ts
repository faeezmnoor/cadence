/**
 * CAD-90 (Phase 5.1 Pro Tier): eval gate readiness helper.
 *
 * Aggregates the last 7 days of manually-rated digest runs (the rating lives
 * in `digest_runs.metadata.manualRating`, written by admin.rateBrief — Evals
 * Phase 0) and decides whether the Pro tier has accumulated enough signal to
 * be flipped on for everyone.
 *
 * Readiness rule (intentionally conservative for an alpha):
 *   - >=5 Pro-tier ratings in the window, AND
 *   - >=5 Default-tier ratings in the window, AND
 *   - Pro composite avg - Default composite avg >= 0.5
 *
 * Composite = (grounding + specificity + fit) / 3 — same axes the admin
 * rateBrief mutation persists.
 *
 * This helper is observational. It does NOT flip any flags; /admin/evals
 * surfaces the verdict so Faeez decides when to ship.
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

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
  | "no_data";

export type EvalGateResult = {
  ready: boolean;
  reason: EvalGateReason;
  metrics: EvalGateMetrics;
};

export const MIN_SAMPLES_PER_TIER = 5;
export const MIN_LEAD = 0.5;
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

  let proCount = 0;
  let defaultCount = 0;
  let proAxes: EvalGateMetrics["proAxes"] = null;
  let defaultAxes: EvalGateMetrics["defaultAxes"] = null;

  for (const r of rows) {
    const n = num(r.n) ?? 0;
    const g = num(r.avg_g);
    const s = num(r.avg_s);
    const f = num(r.avg_f);
    const axes =
      g !== null && s !== null && f !== null
        ? { grounding: round(g, 3)!, specificity: round(s, 3)!, fit: round(f, 3)! }
        : null;
    if (r.tier === "pro") {
      proCount = n;
      proAxes = axes;
    } else if (r.tier === "default") {
      defaultCount = n;
      defaultAxes = axes;
    }
  }

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
  if (lead === null || lead < MIN_LEAD) {
    return { ready: false, reason: "lead_below_threshold", metrics };
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
