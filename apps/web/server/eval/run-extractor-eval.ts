/**
 * Extractor precision/recall eval (Workstream B / CAD-182).
 *
 * Reads `apps/web/test/fixtures/extract/golden.json`, runs each message
 * through the live extractor, computes precision + recall against
 * hand-labeled expected slots, prints a scorecard.
 *
 * Run:
 *   cd apps/web && tsx --env-file=.env.local server/eval/run-extractor-eval.ts
 *
 * NOT wired to CI — this hits OpenAI and costs ~$0.002 per full run.
 * Floors per blueprint §1.4: precision ≥ 0.9, recall ≥ 0.7.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractSlots } from "../ai/config-agent/extract";
import type { ExtractedSlots } from "../ai/config-agent/extract-schema";

interface GoldenRow {
  id: string;
  message: string;
  expected: Record<string, unknown>;
}

const SLOTS = [
  "industry",
  "topics",
  "frequency",
  "delivery_time_local",
  "days_of_week",
  "language",
  "tone_preset",
  "length_target",
] as const;

function slotValue(slots: ExtractedSlots, key: (typeof SLOTS)[number]): unknown {
  const v = (slots as Record<string, unknown>)[key];
  if (!v) return undefined;
  if (typeof v === "object" && "value" in (v as object)) {
    return (v as { value: unknown }).value;
  }
  return v;
}

function arraysEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function softEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return arraysEqual(actual, expected);
  if (typeof expected === "string" && typeof actual === "string") {
    return actual.toLowerCase().includes(expected.toLowerCase()) ||
      expected.toLowerCase().includes(actual.toLowerCase());
  }
  return actual === expected;
}

async function main() {
  const fixturePath = join(
    process.cwd(),
    "test",
    "fixtures",
    "extract",
    "golden.json"
  );
  const rows = JSON.parse(readFileSync(fixturePath, "utf8")) as GoldenRow[];

  let tp = 0; // extractor said X, golden agrees
  let fp = 0; // extractor said X, golden didn't include it
  let fn = 0; // golden expected X, extractor missed it
  let totalCostMicro = 0;
  let totalLatencyMs = 0;

  const fails: string[] = [];

  for (const row of rows) {
    const r = await extractSlots({
      latestUserMessage: row.message,
      draft: undefined,
    });
    totalLatencyMs += r.latencyMs;
    if (r.status !== "ok" && r.status !== "disabled") {
      fails.push(`${row.id} extractor ${r.status}: ${r.error ?? "unknown"}`);
      continue;
    }
    for (const slot of SLOTS) {
      const actual = slotValue(r.slots, slot);
      const expected = (row.expected as Record<string, unknown>)[slot];
      const actualPresent = actual !== undefined && actual !== null;
      const expectedPresent = expected !== undefined && expected !== null;
      if (actualPresent && expectedPresent) {
        if (softEqual(actual, expected)) tp++;
        else {
          fp++;
          fails.push(`${row.id}.${slot} expected=${JSON.stringify(expected)} got=${JSON.stringify(actual)}`);
        }
      } else if (actualPresent && !expectedPresent) {
        fp++;
        fails.push(`${row.id}.${slot} unexpected=${JSON.stringify(actual)}`);
      } else if (!actualPresent && expectedPresent) {
        fn++;
        fails.push(`${row.id}.${slot} missed=${JSON.stringify(expected)}`);
      }
    }
  }
  void totalCostMicro;

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);

  console.log("=".repeat(60));
  console.log("Extractor eval — golden set");
  console.log("=".repeat(60));
  console.log(`Rows: ${rows.length}`);
  console.log(`TP=${tp}  FP=${fp}  FN=${fn}`);
  console.log(`Precision: ${precision.toFixed(3)} (floor 0.900)`);
  console.log(`Recall:    ${recall.toFixed(3)} (floor 0.700)`);
  console.log(`Avg latency: ${(totalLatencyMs / rows.length).toFixed(0)}ms`);
  console.log();
  if (fails.length > 0) {
    console.log("Mismatches:");
    for (const f of fails) console.log(`  - ${f}`);
  }
  console.log();

  const pass = precision >= 0.9 && recall >= 0.7;
  console.log(pass ? "GATE: PASS" : "GATE: FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
