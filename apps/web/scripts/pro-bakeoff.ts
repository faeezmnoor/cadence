/**
 * CAD-222 — Pro integrity bake-off runner (env-gated MANUAL tooling).
 *
 * Runs spec × contender × N briefs through the two competing research
 * stacks (see `getBakeoffStack` in server/ai/providers/index.ts), scores
 * each brief with a Haiku judge (grounding / specificity / fit, 1-5 —
 * mirrors the admin.rateBrief axes the eval gate aggregates), and writes
 * a timestamped JSON report + markdown summary table.
 *
 * Run (repo TS-script convention — same as server/eval/run-extractor-eval.ts):
 *
 *   cd apps/web
 *   npx tsx --env-file=.env.local scripts/pro-bakeoff.ts \
 *     --contender both --runs 1 --specs scripts/pro-bakeoff/specs
 *
 *   # harness self-test, no API keys, no spend:
 *   npx tsx scripts/pro-bakeoff.ts --dry-run
 *
 * Why a tsx-run .ts and not an apply-NNNN.mjs-style node script: the
 * whole point is to exercise the REAL provider seam (getBakeoffStack →
 * perplexity.ts / anthropic-websearch.ts / compose.ts), which is TS with
 * `@/` imports — an .mjs would have to duplicate that logic. The repo
 * already runs TS eval tooling via tsx (server/eval/run-extractor-eval.ts).
 *
 * Env: ANTHROPIC_API_KEY (always, unless --dry-run), PERPLEXITY_API_KEY
 * (for the perplexity_sonnet contender). NO database access — cost rows
 * attempted by the providers fail harmlessly without DATABASE_URL (see
 * recordCost); the report carries its own cost figures.
 *
 * Spec file shape (one JSON file per spec in --specs dir):
 *   { "name": "<short label>", "spec": <DigestSpecV1> }
 * `spec` is validated with digestSpecSchema before any money is spent.
 * Example fixtures: scripts/pro-bakeoff/specs/*.json. Runbook + decision
 * criterion: scripts/PRO-BAKEOFF.md.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestSpecSchema, type DigestSpecV1 } from "../lib/digest-spec/schema";
import { getBakeoffStack } from "../server/ai/providers";
import type {
  ComposerInput,
  ComposerOutput,
  ComposerSearchSource,
  ComposerSourcesBundle,
} from "../server/ai/composer/types";
import { PRO_COMPOSER_MODEL_ID } from "../server/ai/providers/anthropic-pro";
import {
  buildJudgePrompt,
  contendersToRun,
  parseArgs,
  parseJudgeScores,
  renderMarkdownSummary,
  shapeReport,
  type BakeoffRow,
  type ContenderId,
  type JudgeScores,
} from "./pro-bakeoff/lib";

const JUDGE_MODEL_ID = "claude-haiku-4-5-20251001";
const JUDGE_MAX_TOKENS = 600;
// Haiku 4.5 pricing (matches ANTHROPIC_PRICING in server/cost/record.ts).
const JUDGE_INPUT_PER_1M = 1.0;
const JUDGE_OUTPUT_PER_1M = 5.0;
/** Queries per spec for the A2 search step (one per topic, capped). */
const MAX_SEARCH_QUERIES = 3;
/** Joined cap across per-query memos (each already ≤4000 at the provider). */
const MEMO_JOIN_CAP_CHARS = 8_000;

interface SpecFile {
  name: string;
  spec: DigestSpecV1;
}

function loadSpecs(dir: string): SpecFile[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`no spec .json files found in ${dir} — see PRO-BAKEOFF.md`);
  }
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      name?: unknown;
      spec?: unknown;
    };
    const name =
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : f.replace(/\.json$/, "");
    const parsed = digestSpecSchema.safeParse(raw.spec);
    if (!parsed.success) {
      throw new Error(`${f}: spec failed DigestSpecV1 validation — ${parsed.error.message}`);
    }
    return { name, spec: parsed.data };
  });
}

// ---------------------------------------------------------------------------
// A2 source gathering (simplified stand-in for the pipeline's gather —
// the pipeline owner wires the real tier-aware call site in run.ts)
// ---------------------------------------------------------------------------

interface GatheredSources {
  sources: ComposerSourcesBundle;
  researchMemo?: string;
  searchCostUsd: number;
}

async function gatherViaPerplexity(spec: DigestSpecV1): Promise<GatheredSources> {
  const { search } = getBakeoffStack("perplexity_sonnet");
  if (!search) throw new Error("perplexity_sonnet stack is missing search");
  const queries = spec.topics.slice(0, MAX_SEARCH_QUERIES);
  const searchBundles: ComposerSearchSource[] = [];
  const memos: string[] = [];
  let searchCostUsd = 0;
  for (const query of queries) {
    const resp = await search.search(query, { count: 8 });
    searchCostUsd += resp.costUsd;
    searchBundles.push({
      query,
      results: resp.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.snippet,
        age: r.publishedAt,
      })),
    });
    if (resp.memo) memos.push(`### ${query}\n${resp.memo}`);
  }
  const joined = memos.join("\n\n---\n\n").slice(0, MEMO_JOIN_CAP_CHARS);
  return {
    sources: { search: searchBundles, rss: [] },
    researchMemo: joined || undefined,
    searchCostUsd,
  };
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------

async function judgeBrief(
  spec: DigestSpecV1,
  briefJson: unknown
): Promise<{ scores: JudgeScores; costUsd: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required for the judge");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: JUDGE_MODEL_ID,
      max_tokens: JUDGE_MAX_TOKENS,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: buildJudgePrompt(
            JSON.stringify(spec, null, 2),
            JSON.stringify(briefJson, null, 2)
          ),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`judge call failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");
  const costUsd =
    ((json.usage?.input_tokens ?? 0) * JUDGE_INPUT_PER_1M +
      (json.usage?.output_tokens ?? 0) * JUDGE_OUTPUT_PER_1M) /
    1_000_000;
  return { scores: parseJudgeScores(text), costUsd };
}

// ---------------------------------------------------------------------------
// Dry-run mocks (harness self-test — no keys, no spend)
// ---------------------------------------------------------------------------

function dryRunBrief(specName: string, contender: ContenderId): ComposerOutput {
  const brief = {
    schema_version: 1,
    header: {
      date: "11 Jun 2026",
      cadence_label: "Daily",
      industry: specName,
      personalization_summary: `dry-run brief for ${specName}`,
    },
    tldr: `Dry-run signal for ${specName} [1].`,
    sections: [
      {
        heading: "Dry run",
        bullets: [{ text: `Mocked bullet via ${contender} [1]`, citation_markers: [1] }],
      },
    ],
    why_it_matters: "Harness self-test — nothing real happened.",
    feedback_cta: 'Reply 👍 / 👎 — or "tune: <what to change>"',
    sources: [{ marker: 1, title: "Example", url: "https://example.com/dry-run" }],
  };
  return {
    markdown: `# dry-run brief (${contender} / ${specName})`,
    modelId: `${PRO_COMPOSER_MODEL_ID} (mocked)`,
    inputTokens: 1000,
    outputTokens: 500,
    costUsd: contender === "sonnet_websearch" ? 0.05 : 0.02,
    brief,
  };
}

function dryRunScores(contender: ContenderId): JudgeScores {
  const fit = contender === "sonnet_websearch" ? 4 : 3;
  return {
    grounding: 4,
    specificity: 3,
    fit,
    composite: Math.round(((4 + 3 + fit) / 3) * 1000) / 1000,
    rationale: "dry-run mock scores",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runOne(
  specFile: SpecFile,
  contender: ContenderId,
  run: number,
  dryRun: boolean
): Promise<BakeoffRow> {
  if (dryRun) {
    const out = dryRunBrief(specFile.name, contender);
    return {
      specName: specFile.name,
      contender,
      run,
      scores: dryRunScores(contender),
      costUsd: out.costUsd,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      webSearches: contender === "sonnet_websearch" ? 3 : undefined,
      briefMarkdown: out.markdown,
      brief: out.brief,
    };
  }

  const stack = getBakeoffStack(contender);
  let searchCostUsd = 0;
  const input: ComposerInput = {
    spec: specFile.spec,
    sources: { search: [], rss: [] },
  };
  if (contender === "perplexity_sonnet") {
    const gathered = await gatherViaPerplexity(specFile.spec);
    input.sources = gathered.sources;
    input.researchMemo = gathered.researchMemo;
    searchCostUsd = gathered.searchCostUsd;
  }
  // sonnet_websearch: no search step — the composer researches inline.

  const out = await stack.composer.compose(input);
  const judged = await judgeBrief(specFile.spec, out.brief);

  return {
    specName: specFile.name,
    contender,
    run,
    scores: judged.scores,
    costUsd: searchCostUsd + out.costUsd + judged.costUsd,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    briefMarkdown: out.markdown,
    brief: out.brief,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const contenders = contendersToRun(args);

  if (!args.dryRun) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required (or pass --dry-run)");
    }
    if (
      contenders.includes("perplexity_sonnet") &&
      !process.env.PERPLEXITY_API_KEY
    ) {
      throw new Error(
        "PERPLEXITY_API_KEY is required for perplexity_sonnet (or pass --dry-run)"
      );
    }
  }

  const specs = loadSpecs(args.specsDir);
  console.log(
    `[bakeoff] ${specs.length} spec(s) × ${contenders.length} contender(s) × ${args.runs} run(s)` +
      (args.dryRun ? " — DRY RUN" : "")
  );

  const rows: BakeoffRow[] = [];
  for (const specFile of specs) {
    for (const contender of contenders) {
      for (let run = 1; run <= args.runs; run++) {
        const label = `${specFile.name} / ${contender} / run ${run}`;
        try {
          console.log(`[bakeoff] composing: ${label}`);
          const row = await runOne(specFile, contender, run, args.dryRun);
          console.log(
            `[bakeoff]   composite ${row.scores.composite.toFixed(2)} · $${row.costUsd.toFixed(3)}`
          );
          rows.push(row);
        } catch (err) {
          // One bad run must not torch the rest of the budget's results.
          console.error(`[bakeoff]   FAILED ${label}:`, err);
        }
      }
    }
  }

  const report = shapeReport(rows, {
    contenders,
    runs: args.runs,
    specsDir: args.specsDir,
    dryRun: args.dryRun,
    composerModelId: PRO_COMPOSER_MODEL_ID,
    judgeModelId: JUDGE_MODEL_ID,
  });

  mkdirSync(args.outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = join(args.outDir, `pro-bakeoff-${stamp}.json`);
  const mdPath = join(args.outDir, `pro-bakeoff-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderMarkdownSummary(report));

  console.log(`[bakeoff] report: ${jsonPath}`);
  console.log(`[bakeoff] summary: ${mdPath}`);
  console.log(
    `[bakeoff] winner: ${report.verdict.winner ?? "n/a"} · total spend $${report.totalCostUsd.toFixed(3)}`
  );
}

main().catch((err) => {
  console.error("[bakeoff] fatal:", err);
  process.exit(1);
});
