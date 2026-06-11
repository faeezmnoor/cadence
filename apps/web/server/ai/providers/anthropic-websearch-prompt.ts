/**
 * CAD-222 — bake-off contender A3 prompt: Pro Sonnet compose + Anthropic
 * native web-search server tool.
 *
 * Strategy: reuse the FULL Pro composer prompt (rigor preamble + shared
 * structural contract + few-shots + sources block + optional research
 * memo) and APPEND a web-search addendum. Appended — not prepended —
 * because it amends the base contract's hard rule 5 ("cite ONLY URLs in
 * the SOURCES block") and amendments must read after the rule they relax.
 *
 * Citation-folding approach (documented per the bake-off brief): the
 * web-search server tool returns result blocks inside the model's own
 * context, so the cleanest fold is to instruct the model to append any
 * searched URL it cites as an ADDITIONAL numbered entry in the brief's
 * own `sources` array. The shared citation-parity check then validates
 * provided and searched sources identically — no schema change, no
 * downstream branching on tier.
 */
import { buildProComposerSystemPrompt } from "./anthropic-pro-prompt";
import type { ComposerInput } from "@/server/ai/composer/types";

/**
 * Marker so tests + log scraping can distinguish the A3 prompt variant.
 * Do NOT rely on this string in user-facing copy.
 */
export const WEBSEARCH_PROMPT_TAG = "[cadence-pro-websearch-v1]";

const WEBSEARCH_ADDENDUM = [
  "",
  "---",
  WEBSEARCH_PROMPT_TAG,
  "",
  "WEB SEARCH (this run only)",
  "You have the `web_search` tool. Run 2-3 TARGETED searches to fill gaps",
  "in the SOURCES block above: missing entities from the spec, numbers a",
  "source mentions but doesn't quantify, spec topics the sources don't",
  "cover at all. Do NOT re-search what the sources already answer, and do",
  "not exceed 3 searches — each one costs real money.",
  "",
  "FOLDING SEARCH RESULTS INTO SOURCES (amends hard rule 5)",
  "A URL you saw in a web_search result MAY be cited: append it as an",
  "ADDITIONAL numbered entry in the JSON `sources` array, continuing the",
  "numbering after the provided sources (keep the total at 15 or fewer).",
  "Citation parity still applies in full: every inline [n] needs a",
  "matching sources[] entry and every sources[] entry must be cited.",
  "You may cite ONLY (a) URLs from the SOURCES block, or (b) URLs that",
  "appeared in a web_search result this turn. Inventing URLs remains a",
  "hard fail.",
].join("\n");

export function buildWebSearchComposerSystemPrompt(
  input: ComposerInput
): string {
  return buildProComposerSystemPrompt(input) + WEBSEARCH_ADDENDUM;
}
