/**
 * CAD-226 — standard-tier grounding baseline (decision-critical, ~$0.50).
 *
 * The advanced-stack eval (pro-bakeoff.ts) showed grounding stuck at ~2.3
 * under the informed judge. The founder's question before deciding scope:
 * does the STANDARD tier ground BETTER? Standard's grounding mechanism is
 * structural — the default composer (Haiku) is forbidden by its system
 * prompt (hard rule 5) from citing any URL outside the provided SOURCES
 * block, so it CANNOT cite a hallucinated or landing-page URL the way a
 * web-search composer can.
 *
 * This isolates exactly that: gather real sources (via the same Perplexity
 * search the A2 path uses — no Brave key in this env), compose with the
 * production DEFAULT Haiku composer, and judge with the SAME informed
 * judge (URL-resolution-aware). Result is directional, clearly labeled in
 * the report: "default composer over gathered sources," not the full
 * production Brave+RSS+scraper gather.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/grounding-baseline.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";
import { composeDigest } from "@/server/ai/composer/compose";
import { getBakeoffStack } from "@/server/ai/providers";
import { authorityDomainsForSpec } from "@/server/sources/authority";
import { resolveSourceUrls } from "@/server/digest/sources/resolve";
import { buildJudgePrompt, parseJudgeScores } from "@/scripts/pro-bakeoff/lib";
import type {
  ComposerInput,
  ComposerSearchSource,
} from "@/server/ai/composer/types";

const SPECS_DIR = "scripts/pro-bakeoff/specs";
const OUT_DIR = "scripts/pro-bakeoff/reports";
const RUNS = 2;
const MAX_QUERIES = 3;
const JUDGE_MODEL = "claude-haiku-4-5-20251001";

function loadSpecs(): { name: string; spec: DigestSpecV1 }[] {
  return readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(SPECS_DIR, f), "utf8")) as {
        name?: string;
        spec?: unknown;
      };
      const parsed = digestSpecSchema.safeParse(raw.spec);
      if (!parsed.success) throw new Error(`${f}: ${parsed.error.message}`);
      return { name: raw.name ?? f.replace(/\.json$/, ""), spec: parsed.data };
    });
}

async function gather(spec: DigestSpecV1): Promise<ComposerInput["sources"]> {
  const { search } = getBakeoffStack("perplexity_sonnet");
  if (!search) throw new Error("missing search provider");
  const authorityDomains = authorityDomainsForSpec(spec);
  const bundles: ComposerSearchSource[] = [];
  for (const query of spec.topics.slice(0, MAX_QUERIES)) {
    const resp = await search.search(query, { count: 8, authorityDomains });
    bundles.push({
      query,
      results: resp.results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.snippet,
        age: r.publishedAt,
      })),
    });
  }
  return { search: bundles, rss: [] };
}

async function judge(
  spec: DigestSpecV1,
  brief: unknown,
  urlResolution: string
): Promise<ReturnType<typeof parseJudgeScores>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 600,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: buildJudgePrompt(
            JSON.stringify(spec, null, 2),
            JSON.stringify(brief, null, 2),
            urlResolution
          ),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`judge ${res.status}`);
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");
  return parseJudgeScores(text);
}

async function main() {
  const specs = loadSpecs();
  const rows: Array<{ spec: string; run: number; g: number; s: number; f: number }> = [];
  for (const { name, spec } of specs) {
    const sources = await gather(spec);
    for (let run = 1; run <= RUNS; run++) {
      console.log(`[baseline] composing: ${name} / default(haiku) / run ${run}`);
      try {
        const out = await composeDigest({ spec, sources });
        const briefSources =
          (out.brief as { sources?: Array<{ marker: number; url: string }> }).sources ?? [];
        const resolved = await resolveSourceUrls(briefSources.map((s) => s.url));
        const urlResolution = briefSources
          .map(
            (s, i) =>
              `[${s.marker}] ${resolved[i]?.resolved ? `resolved (${resolved[i].status})` : "FAILED"} — ${s.url}`
          )
          .join("\n");
        const sc = await judge(spec, out.brief, urlResolution);
        console.log(`[baseline]   G=${sc.grounding} S=${sc.specificity} F=${sc.fit}`);
        rows.push({ spec: name, run, g: sc.grounding, s: sc.specificity, f: sc.fit });
      } catch (err) {
        console.log(`[baseline]   FAILED: ${(err as Error).message}`);
      }
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const summary = {
    n: rows.length,
    grounding: r3(mean(rows.map((r) => r.g))),
    specificity: r3(mean(rows.map((r) => r.s))),
    fit: r3(mean(rows.map((r) => r.f))),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const md = [
    "# Standard-tier grounding baseline (CAD-226)",
    "",
    "Default Haiku composer over Perplexity-gathered real sources, informed judge.",
    "NOTE: not the full production Brave+RSS+scraper gather (no Brave key in eval env).",
    "",
    `| Tier | n | Grounding | Specificity | Fit |`,
    `|---|---:|---:|---:|---:|`,
    `| default (haiku) | ${summary.n} | ${summary.grounding} | ${summary.specificity} | ${summary.fit} |`,
    "",
    "## Per-run",
    "| Spec | Run | G | S | F |",
    "|---|---:|---:|---:|---:|",
    ...rows.map((r) => `| ${r.spec} | ${r.run} | ${r.g} | ${r.s} | ${r.f} |`),
  ].join("\n");
  writeFileSync(join(OUT_DIR, "grounding-baseline.md"), md);
  console.log(`\n[baseline] default grounding ${summary.grounding} / specificity ${summary.specificity} / fit ${summary.fit} (n=${summary.n})`);
  console.log(`[baseline] report: ${join(OUT_DIR, "grounding-baseline.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
