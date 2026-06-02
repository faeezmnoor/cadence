/**
 * Weekly distill prompt (T-405 / CAD-46).
 *
 * Folds raw `learning_log` signals (verbatim /tune commands, feedback
 * events) plus the user's previous canonical bias list into a NEW
 * canonical bias list stored at `users.distilled_prefs`.
 *
 * Contract:
 *   - Output is a JSON array of short bullet strings. Each bullet is a
 *     single directional bias ("prefer tables", "avoid crypto",
 *     "include China commerce angle"). 5-12 bullets typical.
 *   - Newest signals weighted higher than older signals.
 *   - Contradictions resolve in favor of the NEWEST signal — the user
 *     changed their mind; respect that.
 *   - Bullets are terse: imperative voice, no preamble, no quoting.
 *
 * The downstream consumer is the composer feedback-block builder
 * (`server/ai/composer/feedback-block.ts`), which renders each bullet
 * as `- <bullet>\n` under a "LEARNED PREFERENCES" heading. Format
 * decisions there shape format decisions here.
 */

export interface DistillSignal {
  /** ISO date string for prefixing (newest first). */
  isoDate: string;
  /** Verbatim raw_text from learning_log. */
  text: string;
}

export interface BuildDistillPromptArgs {
  /** Previous canonical bullets (may be empty). */
  priorPrefs: string[];
  /** Raw signals to fold, newest-first. */
  signals: DistillSignal[];
}

export function buildDistillSystemPrompt(): string {
  return [
    "You distill a user's bias signals into a stable canonical preference list",
    "for a personalized industry-digest newsletter.",
    "",
    "Output: a JSON array of 5-12 short bullet strings. No preamble, no",
    "code fences, no keys — just a bare JSON array.",
    "",
    "Each bullet:",
    "  - imperative or directional (e.g. 'prefer tables', 'avoid crypto',",
    "    'include China commerce angle')",
    "  - terse — max ~12 words",
    "  - no quoting, no first-person, no apology",
    "",
    "Weighting:",
    "  - Newer signals override older signals on contradiction.",
    "  - Prior canonical prefs are background bias; drop any that the",
    "    newest signals overturn.",
    "  - Merge near-duplicates into one stronger bullet.",
    "",
    "If signals are sparse, return the prior prefs (filtered for any",
    "newest-signal contradictions). Never invent preferences the user",
    "did not express.",
  ].join("\n");
}

export function buildDistillUserPrompt(args: BuildDistillPromptArgs): string {
  const priorBlock =
    args.priorPrefs.length > 0
      ? args.priorPrefs.map((p) => `- ${p}`).join("\n")
      : "(none)";

  const signalsBlock =
    args.signals.length > 0
      ? args.signals.map((s) => `- ${s.isoDate}: ${s.text}`).join("\n")
      : "(none)";

  return [
    "PRIOR CANONICAL PREFERENCES:",
    priorBlock,
    "",
    "NEW SIGNALS (newest first):",
    signalsBlock,
    "",
    "Return the new canonical preference list as a JSON array of strings now.",
  ].join("\n");
}

/**
 * Parse the LLM response. The system prompt instructs a bare JSON array,
 * but real LLMs occasionally wrap in code fences or add trailing prose.
 * Be tolerant: extract the first `[...]` block and JSON.parse it.
 *
 * Throws if no array can be extracted or parsed — caller should catch
 * and skip the write rather than poison `users.distilled_prefs`.
 */
export function parseDistillOutput(raw: string): string[] {
  const trimmed = raw.trim();

  // Fast path: it's already a clean array.
  let candidate = trimmed;

  // Strip code fences if present.
  if (candidate.startsWith("```")) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    candidate = candidate.trim();
  }

  // If still not starting with '[', try to find the first bracketed array.
  if (!candidate.startsWith("[")) {
    const start = candidate.indexOf("[");
    const end = candidate.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("distill output did not contain a JSON array");
    }
    candidate = candidate.slice(start, end + 1);
  }

  const parsed: unknown = JSON.parse(candidate);
  if (!Array.isArray(parsed)) {
    throw new Error("distill output JSON was not an array");
  }

  const bullets: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim();
    if (cleaned.length === 0) continue;
    bullets.push(cleaned);
  }
  if (bullets.length === 0) {
    throw new Error("distill output array was empty after cleaning");
  }
  return bullets;
}
