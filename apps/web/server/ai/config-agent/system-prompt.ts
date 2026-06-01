/**
 * Reads the versioned config-agent system prompt from disk at build time
 * (via Node fs at module init — Next.js serializes this server module
 * into the route bundle once).
 *
 * If we ever move to a CMS-backed prompt we swap this file out; everything
 * else (chat route, eval harness) consumes a string.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | null = null;

/**
 * Resolve the prompts dir robustly. process.cwd() differs between
 * `next dev` (apps/web), `next start` (apps/web), and Vercel serverless
 * (/var/task). We try multiple candidate paths and use the first that
 * exists. The Vercel build also explicitly traces ../../prompts via
 * outputFileTracingIncludes in next.config.mjs.
 */
function resolvePromptPath(filename: string): string {
  // __dirname equivalent for ESM-compiled output.
  let here = "";
  try {
    // In ESM-compiled output import.meta.url is set; in CJS we fall back to
    // __dirname. Either way, here = dir of this compiled module.
    if (typeof import.meta !== "undefined" && import.meta.url) {
      here = dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // fall through
  }
  if (!here && typeof __dirname !== "undefined") here = __dirname;

  const candidates = [
    // Vercel: traced files land alongside the function at /var/task.
    here && join(here, "..", "..", "..", "..", "..", "prompts", filename),
    // From apps/web cwd up to repo root.
    join(process.cwd(), "..", "..", "prompts", filename),
    // Repo-root cwd (vitest, scripts).
    join(process.cwd(), "prompts", filename),
    // Vercel serverless root.
    join("/var/task", "prompts", filename),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `config-agent system prompt not found. Tried: ${candidates.join(", ")}`
  );
}

export function loadConfigAgentSystemPrompt(): string {
  if (cached) return cached;
  const path = resolvePromptPath("config_agent_v1.md");
  cached = readFileSync(path, "utf8");
  return cached;
}
