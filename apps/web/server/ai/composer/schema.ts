/**
 * Composer JSON brief schema (Stream A — brief-template-v1).
 *
 * The composer LLM emits a single JSON object matching `briefJsonSchema`.
 * A pure-TS renderer (`render.ts`) turns it into delivery-channel markdown.
 *
 * Why JSON-then-render (see blueprint/brief-template-v1.md):
 *   1. Determinism — every brief has the same shape; tests assert structure
 *      without parsing prose.
 *   2. Future surfaces — web preview, email, OG cards all consume the
 *      same JSON.
 *   3. Personalization audit — `header.personalization_summary` +
 *      `why_it_matters` are required fields, so personalization is
 *      observable, not implicit.
 *
 * IMPORTANT: This schema is channel-agnostic. It does NOT say "Telegram".
 * The renderer is responsible for channel-specific formatting.
 */
import { z } from "zod";

export const BRIEF_SCHEMA_VERSION = 1 as const;

/** A single source citation. `marker` is the [n] referenced inline. */
export const briefSourceSchema = z
  .object({
    marker: z.number().int().min(1).max(99),
    title: z.string().min(1).max(200),
    url: z.string().url().max(800),
  })
  .strict();

export const briefBulletSchema = z
  .object({
    text: z.string().min(1).max(400),
    /** Citation markers referenced by this bullet, e.g. [1][2]. */
    citation_markers: z.array(z.number().int().min(1).max(99)).max(6).default([]),
  })
  .strict();

export const briefSectionSchema = z
  .object({
    heading: z.string().min(1).max(80),
    bullets: z.array(briefBulletSchema).min(1).max(5),
  })
  .strict();

export const briefHeaderSchema = z
  .object({
    /** Human-readable date e.g. "2 Jun 2026". */
    date: z.string().min(1).max(40),
    /** Cadence label e.g. "Daily", "Weekly", "Monthly". */
    cadence_label: z.string().min(1).max(40),
    /** Short industry tag e.g. "Palm oil & feedstock". */
    industry: z.string().min(1).max(120),
    /** 1-line "tuned for…" personalization summary. */
    personalization_summary: z.string().min(1).max(200),
  })
  .strict();

export const briefJsonSchema = z
  .object({
    schema_version: z.literal(BRIEF_SCHEMA_VERSION),
    header: briefHeaderSchema,
    /** Optional TL;DR sentence; may carry citation markers in text. */
    tldr: z.string().min(1).max(500),
    /**
     * Ticket 2 (UX audit follow-up): loosened from `.min(3)` to `.min(1)`.
     * The composer must NOT pad-or-fail when signal is thin — a single
     * high-signal section is a better brief than three half-empty ones.
     * Low-signal briefs are still observable via `metadata.lowConfidence`
     * (set in apps/web/server/digest/run.ts) and surfaced on
     * /admin/missing-capabilities so we know what data sources to add.
     */
    sections: z.array(briefSectionSchema).min(1).max(5),
    /** "Why this matters to you" closer — REQUIRED; this is how we prove personalization. */
    why_it_matters: z.string().min(1).max(600),
    /** Plain-text feedback CTA line (NOT button labels — buttons live at dispatch layer). */
    feedback_cta: z.string().min(1).max(160),
    sources: z.array(briefSourceSchema).min(1).max(15),
  })
  .strict();

export type BriefJson = z.infer<typeof briefJsonSchema>;
export type BriefSection = z.infer<typeof briefSectionSchema>;
export type BriefSource = z.infer<typeof briefSourceSchema>;

/**
 * Pull all citation markers (numbers in [n] form) out of a free-text string.
 * Used to verify that every marker in body has a matching `sources[]` entry.
 */
export function extractCitationMarkers(text: string): number[] {
  const out: number[] = [];
  const re = /\[(\d{1,2})\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export interface CitationParityResult {
  ok: boolean;
  /** Markers referenced in body but NOT present in `sources[].marker`. */
  missingSources: number[];
  /** Sources declared but never cited anywhere in body. */
  unusedSources: number[];
}

/** Verify citation parity: every [n] in body has a source, every source is cited. */
export function checkCitationParity(brief: BriefJson): CitationParityResult {
  const declared = new Set(brief.sources.map((s) => s.marker));
  const used = new Set<number>();

  for (const n of extractCitationMarkers(brief.tldr)) used.add(n);
  for (const n of extractCitationMarkers(brief.why_it_matters)) used.add(n);
  for (const section of brief.sections) {
    for (const n of extractCitationMarkers(section.heading)) used.add(n);
    for (const bullet of section.bullets) {
      for (const n of extractCitationMarkers(bullet.text)) used.add(n);
      for (const n of bullet.citation_markers) used.add(n);
    }
  }

  const missingSources: number[] = [];
  for (const n of used) {
    if (!declared.has(n)) missingSources.push(n);
  }
  const unusedSources: number[] = [];
  for (const n of declared) {
    if (!used.has(n)) unusedSources.push(n);
  }

  return {
    ok: missingSources.length === 0 && unusedSources.length === 0,
    missingSources: missingSources.sort((a, b) => a - b),
    unusedSources: unusedSources.sort((a, b) => a - b),
  };
}

/**
 * Rewrite every [n] citation marker in `text` through `renumber`.
 * Markers not present in the map are left untouched. Pure, single pass —
 * no sequential-replace collision hazards.
 */
export function renumberMarkersInText(
  text: string,
  renumber: Map<number, number>
): string {
  return text.replace(/\[(\d{1,2})\]/g, (full, digits: string) => {
    const n = Number.parseInt(digits, 10);
    const mapped = renumber.get(n);
    return mapped === undefined ? full : `[${mapped}]`;
  });
}

export interface PrunedBriefResult {
  brief: BriefJson;
  /** How many never-cited sources were dropped. */
  prunedUnused: number;
}

/**
 * CAD-219 deterministic repair ($0, pure code, no LLM call).
 *
 * When the ONLY citation-parity defect is `unusedSources` (the model
 * declared sources it never cited — a cosmetic defect), drop the unused
 * entries and renumber the remaining markers 1..k consistently across:
 *   - `sources[].marker`
 *   - inline [n] markers in `tldr`, `why_it_matters`, section headings,
 *     and bullet text
 *   - `bullets[].citation_markers`
 *
 * The repair NEVER invents or alters cited content — it only drops unused
 * entries and renumbers. Renumbering is order-stable: kept sources keep
 * their relative order (ascending old marker).
 *
 * Returns `null` when the brief is NOT repairable this way:
 *   - parity already ok (nothing to do), or
 *   - any `missingSources` exist (cited markers without sources — content
 *     defect, needs the LLM retry path), or
 *   - ALL sources are unused (the text cites nothing; schema requires ≥1
 *     source, and a citation-free brief is a real quality defect), or
 *   - duplicate markers in `sources` (pathological; fail closed).
 *
 * Input is never mutated.
 */
export function pruneUnusedSources(brief: BriefJson): PrunedBriefResult | null {
  const parity = checkCitationParity(brief);
  if (parity.ok) return null;
  if (parity.missingSources.length > 0) return null;
  if (parity.unusedSources.length >= brief.sources.length) return null;

  const unused = new Set(parity.unusedSources);
  const kept = [...brief.sources]
    .filter((s) => !unused.has(s.marker))
    .sort((a, b) => a.marker - b.marker);

  // Duplicate markers make the renumber map ambiguous — fail closed and
  // let the caller fall through to the retry/throw path.
  if (new Set(kept.map((s) => s.marker)).size !== kept.length) return null;

  const renumber = new Map<number, number>();
  kept.forEach((s, i) => renumber.set(s.marker, i + 1));

  const fix = (text: string) => renumberMarkersInText(text, renumber);

  const repaired: BriefJson = {
    ...brief,
    tldr: fix(brief.tldr),
    why_it_matters: fix(brief.why_it_matters),
    sections: brief.sections.map((section) => ({
      heading: fix(section.heading),
      bullets: section.bullets.map((bullet) => ({
        text: fix(bullet.text),
        citation_markers: bullet.citation_markers.map(
          (n) => renumber.get(n) ?? n
        ),
      })),
    })),
    sources: kept.map((s, i) => ({ ...s, marker: i + 1 })),
  };

  return { brief: repaired, prunedUnused: parity.unusedSources.length };
}

/**
 * Extract the first balanced JSON object from a messy LLM response.
 *
 * Handles: leading prose, ```json fences, trailing prose, unbalanced braces
 * inside strings (respects escapes).
 *
 * Returns the parsed object or throws.
 */
export function extractJsonObject(raw: string): unknown {
  if (!raw) throw new ComposerJsonError("empty response");

  // Strip code fences if present.
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  if (start < 0) throw new ComposerJsonError("no opening brace in response");

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) throw new ComposerJsonError("unbalanced braces in response");

  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice) as unknown;
  } catch (err) {
    throw new ComposerJsonError(
      `JSON parse failed: ${(err as Error).message}`
    );
  }
}

export class ComposerJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposerJsonError";
  }
}
