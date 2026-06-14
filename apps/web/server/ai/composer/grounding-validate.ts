/**
 * CAD-226 grounding fix 2 — resolution-aware post-parse validator.
 *
 * Shared `postParseValidate` hook for the advanced composers. After a
 * brief parses, resolve every cited URL; if any fail (dead link — a 404 /
 * 500 / timeout the informed-judge eval penalizes hardest, e.g. "source
 * [1] failed (500), cited in the TLDR — critical grounding gap"), return a
 * corrective addendum that names the dead markers so the model re-sources
 * or drops the dependent claim. Returns null when every citation resolves.
 *
 * Deliberately advanced-only: the default (Haiku) tier cites pre-fetched
 * sources that already resolved during gathering, so it needs no extra
 * network round trip. Bounded by the resolver's own per-URL timeout.
 */
import type { BriefJson } from "./schema";
import { resolveSourceUrls } from "@/server/digest/sources/resolve";

export function makeDeadLinkValidator(opts: {
  resolveImpl?: typeof resolveSourceUrls;
} = {}): (brief: BriefJson) => Promise<string | null> {
  const resolve = opts.resolveImpl ?? resolveSourceUrls;
  return async (brief: BriefJson): Promise<string | null> => {
    if (brief.sources.length === 0) return null;
    let results;
    try {
      results = await resolve(brief.sources.map((s) => s.url));
    } catch {
      return null; // resolution failure must never break the compose
    }
    const dead = brief.sources.filter((src, i) => results[i] && !results[i].resolved);
    if (dead.length === 0) return null;
    const list = dead
      .map((s) => `  [${s.marker}] ${s.url}`)
      .join("\n");
    return [
      "CORRECTION REQUIRED — DEAD CITATIONS.",
      "These cited URLs did not resolve (HTTP error or timeout):",
      list,
      "Re-emit the FULL JSON brief. For each dead citation, either replace",
      "it with a working source that genuinely contains the claim, or drop",
      "the claim entirely. Do not keep any citation to the URLs above. All",
      "other citation and schema rules still apply.",
    ].join("\n");
  };
}
