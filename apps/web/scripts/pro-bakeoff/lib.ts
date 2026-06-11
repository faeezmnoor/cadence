/**
 * CAD-222 — Pro integrity bake-off: pure parts of the runner.
 *
 * Everything in this module is side-effect free (no fs, no network, no
 * db) so it can be unit-tested (`test/pro-bakeoff-lib.test.ts`) while the
 * runner script itself stays env-gated manual tooling. See
 * `scripts/PRO-BAKEOFF.md` for the runbook and the pre-registered
 * decision criterion.
 */

export const CONTENDERS = ["perplexity_sonnet", "sonnet_websearch"] as const;
export type ContenderId = (typeof CONTENDERS)[number];

// Founder ruling 2026-06-11: there is NO per-brief cost ceiling. Quality
// decides the head-to-head; measured $/brief is informational and feeds
// per-stack credit pricing (each stack option charges credits that cover
// its own cost). The earlier $0.10 pre-registered ceiling is rescinded.

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

export interface BakeoffArgs {
  /** "both" runs A2 + A3 — the normal bake-off mode. */
  contender: ContenderId | "both";
  /** Runs per spec per contender. */
  runs: number;
  /** Directory of spec JSON files. */
  specsDir: string;
  /** Output directory for the timestamped report pair. */
  outDir: string;
  /** Mock every model call — harness test mode, no keys needed. */
  dryRun: boolean;
}

export const DEFAULT_ARGS: BakeoffArgs = {
  contender: "both",
  runs: 1,
  specsDir: "scripts/pro-bakeoff/specs",
  outDir: "scripts/pro-bakeoff/reports",
  dryRun: false,
};

export function parseArgs(argv: string[]): BakeoffArgs {
  const args: BakeoffArgs = { ...DEFAULT_ARGS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        throw new Error(`flag ${a} expects a value`);
      }
      i++;
      return v;
    };
    switch (a) {
      case "--contender": {
        const v = next();
        if (v !== "both" && !CONTENDERS.includes(v as ContenderId)) {
          throw new Error(
            `--contender must be one of: ${CONTENDERS.join(", ")}, both`
          );
        }
        args.contender = v as BakeoffArgs["contender"];
        break;
      }
      case "--runs": {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 1 || n > 20) {
          throw new Error("--runs must be an integer 1-20");
        }
        args.runs = n;
        break;
      }
      case "--specs":
        args.specsDir = next();
        break;
      case "--out":
        args.outDir = next();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }
  return args;
}

export function contendersToRun(args: BakeoffArgs): ContenderId[] {
  return args.contender === "both" ? [...CONTENDERS] : [args.contender];
}

// ---------------------------------------------------------------------------
// Judge (Haiku) — prompt builder + response parser
// ---------------------------------------------------------------------------

/**
 * Rubric mirrors the manual admin.rateBrief axes that the existing eval
 * gate (`server/evals/pro-eval-gate.ts`) aggregates: grounding /
 * specificity / fit, 1-5 each, composite = mean of the three.
 */
export function buildJudgePrompt(specJson: string, briefJson: string): string {
  return [
    "You are a strict research-brief evaluator. Score the BRIEF against",
    "the USER SPEC on three axes, integers 1-5 each:",
    "",
    "- grounding: are claims supported by the cited numbered sources?",
    "  Inline [n] markers present, no obviously invented facts or URLs,",
    "  numbers attributed to a source. 5 = every claim traceable;",
    "  1 = assertions float free of the sources.",
    "- specificity: concrete numbers, named entities, dates, quantified",
    "  deltas. 5 = dense with verbatim figures; 1 = vague qualitative",
    "  filler ('prices rose', 'sentiment improved').",
    "- fit_to_spec: does the brief serve THIS spec — topics covered,",
    "  named entities are the spine, keywords_exclude respected,",
    "  why_it_matters ties to the user's position. 5 = reads custom-made;",
    "  1 = generic industry digest.",
    "",
    "Output ONE JSON object only, no fences, no commentary:",
    '{ "grounding": <1-5>, "specificity": <1-5>, "fit_to_spec": <1-5>,',
    '  "rationale": "<2-3 sentences>" }',
    "",
    "USER SPEC",
    specJson,
    "",
    "BRIEF",
    briefJson,
  ].join("\n");
}

export interface JudgeScores {
  grounding: number;
  specificity: number;
  fit: number;
  composite: number;
  rationale: string;
}

function clampAxis(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`judge axis is not a number: ${String(v)}`);
  }
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Tolerates preamble/fences around the judge's JSON object. */
export function parseJudgeScores(raw: string): JudgeScores {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`judge response has no JSON object: ${raw.slice(0, 120)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<
    string,
    unknown
  >;
  const grounding = clampAxis(parsed.grounding);
  const specificity = clampAxis(parsed.specificity);
  const fit = clampAxis(parsed.fit_to_spec ?? parsed.fit);
  return {
    grounding,
    specificity,
    fit,
    composite: round3((grounding + specificity + fit) / 3),
    rationale:
      typeof parsed.rationale === "string" ? parsed.rationale : "(none)",
  };
}

// ---------------------------------------------------------------------------
// Aggregation + verdict
// ---------------------------------------------------------------------------

export interface BakeoffRow {
  specName: string;
  contender: ContenderId;
  run: number;
  scores: JudgeScores;
  /** Search + compose + judge, USD. */
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** Only for sonnet_websearch. */
  webSearches?: number;
  briefMarkdown: string;
  brief: unknown;
}

export interface ContenderAggregate {
  contender: ContenderId;
  n: number;
  meanComposite: number;
  meanGrounding: number;
  meanSpecificity: number;
  meanFit: number;
  meanCostUsd: number;
  maxCostUsd: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function aggregateScores(
  rows: BakeoffRow[],
  contender: ContenderId
): ContenderAggregate | null {
  const mine = rows.filter((r) => r.contender === contender);
  if (mine.length === 0) return null;
  return {
    contender,
    n: mine.length,
    meanComposite: round3(mean(mine.map((r) => r.scores.composite))),
    meanGrounding: round3(mean(mine.map((r) => r.scores.grounding))),
    meanSpecificity: round3(mean(mine.map((r) => r.scores.specificity))),
    meanFit: round3(mean(mine.map((r) => r.scores.fit))),
    meanCostUsd: round3(mean(mine.map((r) => r.costUsd))),
    maxCostUsd: round3(Math.max(...mine.map((r) => r.costUsd))),
  };
}

export interface BakeoffVerdict {
  winner: ContenderId | null;
  /** winner meanComposite − loser meanComposite (head-to-head). */
  headToHeadDelta: number | null;
  /** Winner's mean $/brief — INFORMATIONAL (feeds per-stack credit
   *  pricing; founder ruling 2026-06-11: no cost ceiling). */
  winnerMeanCostUsd: number | null;
  note: string;
}

/**
 * Head-to-head criterion (CAD-222, founder-amended 2026-06-11):
 *   - between the two contenders, higher mean composite wins — QUALITY
 *     ONLY, no cost gate;
 *   - A3 (sonnet_websearch) wins ties;
 *   - measured $/brief is reported as the input to per-stack credit
 *     pricing, not as a pass/fail;
 *   - the ≥0.5 composite lift over the DEFAULT-tier baseline is measured
 *     via the existing manual-rating gate (server/evals/pro-eval-gate.ts),
 *     NOT inside this report.
 */
export function decideWinner(
  a2: ContenderAggregate | null,
  a3: ContenderAggregate | null
): BakeoffVerdict {
  if (!a2 || !a3) {
    const only = a2 ?? a3;
    return {
      winner: null,
      headToHeadDelta: null,
      winnerMeanCostUsd: only ? only.meanCostUsd : null,
      note: only
        ? `only ${only.contender} ran — no head-to-head verdict`
        : "no rows — nothing to decide",
    };
  }
  // A3 wins ties (pre-registered tiebreak, unchanged by the amendment).
  const winner = a3.meanComposite >= a2.meanComposite ? a3 : a2;
  const loser = winner === a3 ? a2 : a3;
  return {
    winner: winner.contender,
    headToHeadDelta: round3(winner.meanComposite - loser.meanComposite),
    winnerMeanCostUsd: winner.meanCostUsd,
    note:
      winner === a3 && a3.meanComposite === a2.meanComposite
        ? "tie on mean composite — sonnet_websearch wins ties per the pre-registered tiebreak"
        : "higher mean composite wins (quality only — cost is pricing input, not a gate)",
  };
}

// ---------------------------------------------------------------------------
// Report shaping
// ---------------------------------------------------------------------------

export interface BakeoffReport {
  generatedAt: string;
  config: {
    contenders: ContenderId[];
    runs: number;
    specsDir: string;
    dryRun: boolean;
    composerModelId: string;
    judgeModelId: string;
  };
  rows: BakeoffRow[];
  aggregates: ContenderAggregate[];
  verdict: BakeoffVerdict;
  totalCostUsd: number;
}

export function shapeReport(
  rows: BakeoffRow[],
  config: BakeoffReport["config"],
  now: Date = new Date()
): BakeoffReport {
  const aggregates = CONTENDERS.map((c) => aggregateScores(rows, c)).filter(
    (a): a is ContenderAggregate => a !== null
  );
  const a2 = aggregates.find((a) => a.contender === "perplexity_sonnet") ?? null;
  const a3 = aggregates.find((a) => a.contender === "sonnet_websearch") ?? null;
  return {
    generatedAt: now.toISOString(),
    config,
    rows,
    aggregates,
    verdict: decideWinner(a2, a3),
    totalCostUsd: round3(rows.reduce((s, r) => s + r.costUsd, 0)),
  };
}

export function renderMarkdownSummary(report: BakeoffReport): string {
  const lines: string[] = [
    "# Pro bake-off report (CAD-222)",
    "",
    `Generated: ${report.generatedAt}${report.config.dryRun ? " — DRY RUN (mocked model calls)" : ""}`,
    `Composer: ${report.config.composerModelId} · Judge: ${report.config.judgeModelId} · Runs/spec: ${report.config.runs}`,
    "",
    "## Contender aggregates",
    "",
    "| Contender | n | Composite | Grounding | Specificity | Fit | Mean $/brief | Max $/brief |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const a of report.aggregates) {
    lines.push(
      `| ${a.contender} | ${a.n} | ${a.meanComposite.toFixed(3)} | ` +
        `${a.meanGrounding.toFixed(2)} | ${a.meanSpecificity.toFixed(2)} | ` +
        `${a.meanFit.toFixed(2)} | $${a.meanCostUsd.toFixed(3)} | ` +
        `$${a.maxCostUsd.toFixed(3)} |`
    );
  }
  lines.push(
    "",
    "## Verdict",
    "",
    `- Winner (head-to-head): **${report.verdict.winner ?? "n/a"}**`,
    `- Composite delta: ${report.verdict.headToHeadDelta ?? "n/a"}`,
    `- Winner mean $/brief (informational — feeds credit pricing, no ceiling): ${
      report.verdict.winnerMeanCostUsd === null
        ? "n/a"
        : `$${report.verdict.winnerMeanCostUsd.toFixed(3)}`
    }`,
    `- Note: ${report.verdict.note}`,
    `- Total spend this report: $${report.totalCostUsd.toFixed(3)}`,
    "",
    "## Per-run scores",
    "",
    "| Spec | Contender | Run | G | S | F | Composite | $ | Searches |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|"
  );
  for (const r of report.rows) {
    lines.push(
      `| ${r.specName} | ${r.contender} | ${r.run} | ${r.scores.grounding} | ` +
        `${r.scores.specificity} | ${r.scores.fit} | ` +
        `${r.scores.composite.toFixed(2)} | $${r.costUsd.toFixed(3)} | ` +
        `${r.webSearches ?? "-"} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}
