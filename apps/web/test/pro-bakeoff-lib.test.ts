/**
 * CAD-222 — bake-off runner, pure parts. The runner script itself
 * (scripts/pro-bakeoff.ts) is env-gated manual tooling; everything
 * decision-bearing (arg parsing, judge parsing, aggregation, the
 * pre-registered tie rule, report shaping) lives in lib.ts and is
 * tested here. Also guards that the example spec fixtures stay valid
 * DigestSpecV1.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { digestSpecSchema } from "@/lib/digest-spec/schema";
import {
  aggregateScores,
  contendersToRun,
  decideWinner,
  parseArgs,
  parseJudgeScores,
  renderMarkdownSummary,
  shapeReport,
  COST_CEILING_PER_BRIEF_USD,
  DEFAULT_ARGS,
  type BakeoffRow,
  type ContenderAggregate,
  type ContenderId,
  type JudgeScores,
} from "@/scripts/pro-bakeoff/lib";

function scores(g: number, s: number, f: number): JudgeScores {
  return {
    grounding: g,
    specificity: s,
    fit: f,
    composite: Math.round(((g + s + f) / 3) * 1000) / 1000,
    rationale: "test",
  };
}

function row(
  contender: ContenderId,
  composite: Partial<BakeoffRow> & { scores: JudgeScores }
): BakeoffRow {
  return {
    specName: "spec-a",
    contender,
    run: 1,
    costUsd: 0.05,
    inputTokens: 1000,
    outputTokens: 500,
    briefMarkdown: "md",
    brief: {},
    ...composite,
  };
}

describe("parseArgs", () => {
  it("returns defaults for empty argv", () => {
    expect(parseArgs([])).toEqual(DEFAULT_ARGS);
  });

  it("parses explicit flags", () => {
    const args = parseArgs([
      "--contender",
      "sonnet_websearch",
      "--runs",
      "3",
      "--specs",
      "/tmp/specs",
      "--out",
      "/tmp/out",
      "--dry-run",
    ]);
    expect(args).toEqual({
      contender: "sonnet_websearch",
      runs: 3,
      specsDir: "/tmp/specs",
      outDir: "/tmp/out",
      dryRun: true,
    });
  });

  it("rejects unknown contenders, bad runs, unknown flags", () => {
    expect(() => parseArgs(["--contender", "gpt5"])).toThrow(/--contender/);
    expect(() => parseArgs(["--runs", "0"])).toThrow(/--runs/);
    expect(() => parseArgs(["--runs", "1.5"])).toThrow(/--runs/);
    expect(() => parseArgs(["--wat"])).toThrow(/unknown flag/);
    expect(() => parseArgs(["--runs"])).toThrow(/expects a value/);
  });

  it("contendersToRun expands 'both' in stable order", () => {
    expect(contendersToRun(parseArgs([]))).toEqual([
      "perplexity_sonnet",
      "sonnet_websearch",
    ]);
    expect(
      contendersToRun(parseArgs(["--contender", "perplexity_sonnet"]))
    ).toEqual(["perplexity_sonnet"]);
  });
});

describe("parseJudgeScores", () => {
  it("parses a clean JSON object", () => {
    const s = parseJudgeScores(
      '{"grounding": 4, "specificity": 3, "fit_to_spec": 5, "rationale": "ok"}'
    );
    expect(s).toEqual({
      grounding: 4,
      specificity: 3,
      fit: 5,
      composite: 4,
      rationale: "ok",
    });
  });

  it("tolerates fences/preamble and clamps out-of-range axes", () => {
    const s = parseJudgeScores(
      'Here you go:\n```json\n{"grounding": 9, "specificity": 0, "fit_to_spec": 3.6}\n```'
    );
    expect(s.grounding).toBe(5);
    expect(s.specificity).toBe(1);
    expect(s.fit).toBe(4);
    expect(s.rationale).toBe("(none)");
  });

  it("throws on garbage", () => {
    expect(() => parseJudgeScores("no json here")).toThrow(/no JSON object/);
    expect(() =>
      parseJudgeScores('{"grounding": "high", "specificity": 3, "fit_to_spec": 3}')
    ).toThrow(/not a number/);
  });
});

describe("aggregateScores", () => {
  it("means the axes, composite and cost per contender", () => {
    const rows: BakeoffRow[] = [
      row("perplexity_sonnet", { scores: scores(4, 4, 4), costUsd: 0.08 }),
      row("perplexity_sonnet", { scores: scores(2, 3, 4), costUsd: 0.12 }),
      row("sonnet_websearch", { scores: scores(5, 5, 5), costUsd: 0.06 }),
    ];
    const a2 = aggregateScores(rows, "perplexity_sonnet");
    expect(a2).toMatchObject({
      n: 2,
      meanGrounding: 3,
      meanSpecificity: 3.5,
      meanFit: 4,
      meanCostUsd: 0.1,
      maxCostUsd: 0.12,
    });
    expect(a2?.meanComposite).toBeCloseTo(3.5, 3);
    expect(aggregateScores(rows, "sonnet_websearch")?.n).toBe(1);
  });

  it("returns null when a contender has no rows", () => {
    expect(aggregateScores([], "sonnet_websearch")).toBeNull();
  });
});

describe("decideWinner — pre-registered criterion", () => {
  function agg(
    contender: ContenderId,
    meanComposite: number,
    meanCostUsd = 0.05
  ): ContenderAggregate {
    return {
      contender,
      n: 5,
      meanComposite,
      meanGrounding: meanComposite,
      meanSpecificity: meanComposite,
      meanFit: meanComposite,
      meanCostUsd,
      maxCostUsd: meanCostUsd,
    };
  }

  it("higher mean composite wins", () => {
    const v = decideWinner(
      agg("perplexity_sonnet", 4.2),
      agg("sonnet_websearch", 3.9)
    );
    expect(v.winner).toBe("perplexity_sonnet");
    expect(v.headToHeadDelta).toBeCloseTo(0.3, 3);
  });

  it("A3 (sonnet_websearch) wins ties", () => {
    const v = decideWinner(
      agg("perplexity_sonnet", 4.0),
      agg("sonnet_websearch", 4.0)
    );
    expect(v.winner).toBe("sonnet_websearch");
    expect(v.note).toMatch(/tie/);
  });

  it("flags the $0.10/brief ceiling on the winner", () => {
    expect(COST_CEILING_PER_BRIEF_USD).toBe(0.1);
    const under = decideWinner(
      agg("perplexity_sonnet", 3.0),
      agg("sonnet_websearch", 4.0, 0.09)
    );
    expect(under.winnerMeetsCostCeiling).toBe(true);
    const over = decideWinner(
      agg("perplexity_sonnet", 3.0),
      agg("sonnet_websearch", 4.0, 0.31)
    );
    expect(over.winnerMeetsCostCeiling).toBe(false);
  });

  it("no verdict when only one contender ran", () => {
    const v = decideWinner(agg("perplexity_sonnet", 4.0), null);
    expect(v.winner).toBeNull();
    expect(v.note).toMatch(/only perplexity_sonnet/);
  });
});

describe("report shaping", () => {
  const rows: BakeoffRow[] = [
    row("perplexity_sonnet", { scores: scores(4, 4, 4), costUsd: 0.08 }),
    row("sonnet_websearch", {
      scores: scores(4, 4, 5),
      costUsd: 0.06,
      webSearches: 3,
    }),
  ];
  const config = {
    contenders: ["perplexity_sonnet", "sonnet_websearch"] as ContenderId[],
    runs: 1,
    specsDir: "specs",
    dryRun: true,
    composerModelId: "claude-sonnet-4-5-20250929",
    judgeModelId: "claude-haiku-4-5-20251001",
  };

  it("shapeReport aggregates, decides, and totals cost", () => {
    const report = shapeReport(rows, config, new Date("2026-06-11T01:02:03Z"));
    expect(report.generatedAt).toBe("2026-06-11T01:02:03.000Z");
    expect(report.aggregates).toHaveLength(2);
    expect(report.verdict.winner).toBe("sonnet_websearch");
    expect(report.totalCostUsd).toBeCloseTo(0.14, 3);
  });

  it("renderMarkdownSummary emits the summary tables", () => {
    const md = renderMarkdownSummary(
      shapeReport(rows, config, new Date("2026-06-11T01:02:03Z"))
    );
    expect(md).toContain("# Pro bake-off report (CAD-222)");
    expect(md).toContain("DRY RUN");
    expect(md).toContain("| perplexity_sonnet | 1 |");
    expect(md).toContain("| sonnet_websearch | 1 |");
    expect(md).toMatch(/Winner \(head-to-head\): \*\*sonnet_websearch\*\*/);
    expect(md).toContain("## Per-run scores");
  });
});

describe("example spec fixtures", () => {
  it("every fixture in scripts/pro-bakeoff/specs parses as DigestSpecV1", () => {
    const dir = join(process.cwd(), "scripts/pro-bakeoff/specs");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        name: string;
        spec: unknown;
      };
      expect(typeof raw.name).toBe("string");
      const parsed = digestSpecSchema.safeParse(raw.spec);
      expect(parsed.success, `${f}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
    }
  });
});
