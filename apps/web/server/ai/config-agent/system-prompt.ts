/**
 * Reads the versioned config-agent system prompt from disk at build time
 * (via Node fs at module init — Next.js serializes this server module
 * into the route bundle once).
 *
 * If we ever move to a CMS-backed prompt we swap this file out; everything
 * else (chat route, eval harness) consumes a string.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

export function loadConfigAgentSystemPrompt(): string {
  if (cached) return cached;
  // From apps/web → repo root is two levels up.
  const path = join(
    process.cwd(),
    "..",
    "..",
    "prompts",
    "config_agent_v1.md"
  );
  cached = readFileSync(path, "utf8");
  return cached;
}
