/**
 * Per-turn slot extractor (Workstream B / CAD-182).
 *
 * Calls gpt-4o-mini via Vercel AI SDK `generateObject` with a Zod schema
 * and prompt v1 (prompts/extractor_v1.md). Wrapped in a 2s soft timeout so
 * a slow extractor never blocks the streaming UX. On error / timeout we
 * return an empty `ExtractedSlots` so the rest of the pipeline degrades to
 * the pre-Wave-3 behavior.
 *
 * Cost: ~$0.00007 per turn (200 input + 60 output tokens @ gpt-4o-mini).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";
import { extractorSchema, type ExtractedSlots } from "./extract-schema";
import { log } from "@/lib/log";

const EXTRACTOR_TIMEOUT_MS = 2000;
const EXTRACTOR_MODEL = "gpt-4o-mini";

let cachedPrompt: string | null = null;

function resolveExtractorPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  let here = "";
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      here = dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // fall through
  }
  if (!here && typeof __dirname !== "undefined") here = __dirname;
  const candidates = [
    here && join(here, "..", "..", "..", "..", "..", "prompts", "extractor_v1.md"),
    join(process.cwd(), "..", "..", "prompts", "extractor_v1.md"),
    join(process.cwd(), "prompts", "extractor_v1.md"),
    join("/var/task", "prompts", "extractor_v1.md"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (existsSync(p)) {
      cachedPrompt = readFileSync(p, "utf8");
      return cachedPrompt;
    }
  }
  throw new Error(
    `extractor prompt not found. Tried: ${candidates.join(", ")}`
  );
}

export interface ExtractResult {
  slots: ExtractedSlots;
  latencyMs: number;
  status: "ok" | "timeout" | "error" | "disabled";
  error?: string;
}

const EMPTY: ExtractedSlots = {};

function safeStringifyDraft(draft: DigestSpecDraft | undefined): string {
  if (!draft) return "{}";
  try {
    return JSON.stringify(draft);
  } catch {
    return "{}";
  }
}

/**
 * Build the user-facing string the extractor model sees. We keep this
 * narrow on purpose — we want the model to focus on the latest user message
 * and treat the draft as background, not a target to "preserve".
 */
function buildExtractorInput(
  latestUserMessage: string,
  draft: DigestSpecDraft | undefined,
  recentTurns: Array<{ role: string; text: string }>
): string {
  const ctxLines = recentTurns
    .slice(-4)
    .map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.text.slice(0, 280)}`)
    .join("\n");
  return [
    `# Current draft`,
    safeStringifyDraft(draft),
    "",
    `# Recent conversation context (most recent last)`,
    ctxLines || "(none)",
    "",
    `# Latest user message`,
    latestUserMessage,
  ].join("\n");
}

/**
 * Run the extractor. Best-effort: returns empty slots on any failure path
 * so the caller can keep streaming without a hard dependency.
 */
export async function extractSlots(input: {
  latestUserMessage: string;
  draft: DigestSpecDraft | undefined;
  recentTurns?: Array<{ role: string; text: string }>;
}): Promise<ExtractResult> {
  if (!input.latestUserMessage.trim()) {
    return { slots: EMPTY, latencyMs: 0, status: "disabled" };
  }

  const system = resolveExtractorPrompt();
  const userText = buildExtractorInput(
    input.latestUserMessage,
    input.draft,
    input.recentTurns ?? []
  );

  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), EXTRACTOR_TIMEOUT_MS);

  try {
    const { object } = await generateObject({
      model: openai(EXTRACTOR_MODEL),
      schema: extractorSchema,
      system,
      prompt: userText,
      temperature: 0.1,
      maxTokens: 400,
      abortSignal: ac.signal,
    });
    return {
      slots: object,
      latencyMs: Date.now() - started,
      status: "ok",
    };
  } catch (err) {
    const elapsed = Date.now() - started;
    if (ac.signal.aborted) {
      log.warn("extractor: timed out", { ms: elapsed });
      return {
        slots: EMPTY,
        latencyMs: elapsed,
        status: "timeout",
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("extractor: error", { err: msg });
    return {
      slots: EMPTY,
      latencyMs: elapsed,
      status: "error",
      error: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}
