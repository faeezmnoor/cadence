/**
 * Composer prompt builder (T-208).
 *
 * Mirrors the contract in blueprint/04-data-model-and-apis.md (Composer LLM).
 * Pure: no I/O, no LLM call — so it's trivially unit-testable.
 */
import type {
  ComposerInput,
  ComposerSourcesBundle,
} from "./types";

const HARD_CHAR_CAP = 3800;

function yamlify(obj: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null`;
  if (typeof obj === "string") return `${pad}${JSON.stringify(obj)}`;
  if (typeof obj === "number" || typeof obj === "boolean") return `${pad}${obj}`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]`;
    return obj
      .map((v) => `${pad}- ${yamlify(v, 0).trimStart()}`)
      .join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        const child = yamlify(v, indent + 2);
        if (
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          Object.keys(v as object).length > 0
        ) {
          return `${pad}${k}:\n${child}`;
        }
        if (Array.isArray(v) && v.length > 0) {
          return `${pad}${k}:\n${child}`;
        }
        return `${pad}${k}: ${yamlify(v, 0).trimStart()}`;
      })
      .join("\n");
  }
  return `${pad}${String(obj)}`;
}

function summarizeSources(sources: ComposerSourcesBundle): string {
  const parts: string[] = [];

  if (sources.search.length > 0) {
    parts.push("## Web search results");
    for (const bundle of sources.search) {
      parts.push(`### query: ${bundle.query}`);
      bundle.results.slice(0, 10).forEach((r, i) => {
        const age = r.age ? ` (${r.age})` : "";
        parts.push(`${i + 1}. [${r.title}](${r.url})${age}`);
        if (r.description) parts.push(`   ${r.description.slice(0, 280)}`);
      });
    }
  }

  if (sources.rss.length > 0) {
    parts.push("## RSS items (last 48h)");
    sources.rss.slice(0, 30).forEach((r, i) => {
      const when = r.publishedAt ? r.publishedAt.toISOString().slice(0, 16) : "?";
      parts.push(`${i + 1}. [${r.title}](${r.url}) — ${when} — _${r.feedUrl}_`);
      if (r.summary) parts.push(`   ${r.summary.slice(0, 240)}`);
    });
  }

  if (sources.prices && sources.prices.length > 0) {
    parts.push("## Prices");
    for (const p of sources.prices) {
      const ch24 =
        p.change24h !== undefined
          ? ` 24h ${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`
          : "";
      const ch7 =
        p.change7d !== undefined
          ? ` / 7d ${p.change7d >= 0 ? "+" : ""}${p.change7d.toFixed(2)}%`
          : "";
      const cur = p.currency ? ` ${p.currency}` : "";
      parts.push(`- ${p.symbol}: ${p.price}${cur}${ch24}${ch7}`);
    }
  }

  return parts.join("\n") || "(no sources available)";
}

export function buildComposerSystemPrompt(input: ComposerInput): string {
  const { spec, sources, distilledPrefs, recentRawNotes } = input;
  const distilled =
    distilledPrefs && distilledPrefs.length > 0
      ? distilledPrefs.map((b) => `- ${b}`).join("\n")
      : "(none yet)";
  const recent =
    recentRawNotes && recentRawNotes.length > 0
      ? recentRawNotes.map((b) => `- ${b}`).join("\n")
      : "(none yet)";

  const specYaml = yamlify({
    topics: spec.topics,
    entities: spec.entities,
    keywords_include: spec.keywords_include,
    keywords_exclude: spec.keywords_exclude,
    data_addons: spec.data_addons,
    cadence: spec.cadence,
    tone_preset: spec.tone_preset,
    length_target: spec.length_target,
    language: spec.language,
  });

  return [
    "You are Cadence, a daily market intelligence brief generator.",
    "",
    "USER PROFILE",
    `- Tone preset: ${spec.tone_preset}`,
    `- Length target: ${spec.length_target}`,
    `- Language: ${spec.language}`,
    "",
    "LEARNED PREFERENCES (stable)",
    distilled,
    "",
    "RECENT FEEDBACK (most recent first)",
    recent,
    "",
    "DIGEST SPEC",
    specYaml,
    "",
    "SOURCES (already fetched and deduped)",
    summarizeSources(sources),
    "",
    "INSTRUCTIONS",
    `1. Produce a single Telegram-safe Markdown message <= ${HARD_CHAR_CAP} characters.`,
    "2. Lead with a 1-sentence headline.",
    "3. Group by section per the spec's topic order. Use `## Topic` headings.",
    "4. For prices, include 24h change with arrow (▲ / ▼) and percentage.",
    "5. Cite sources inline as [n] with a final `## Sources` footer mapping n -> URL.",
    "6. Skip sections with zero high-signal items rather than padding.",
    "7. Apply RECENT FEEDBACK and LEARNED PREFERENCES aggressively (drop topics the user said to drop, etc).",
    `8. Respect keywords_exclude — never mention those topics.`,
    "9. Write in the user's `language` setting.",
    "10. Return ONLY the Markdown brief. No preamble, no apology, no \"here is your brief:\".",
  ].join("\n");
}

export const COMPOSER_HARD_CHAR_CAP = HARD_CHAR_CAP;
