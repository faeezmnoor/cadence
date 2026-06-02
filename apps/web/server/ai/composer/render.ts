/**
 * Pure JSON -> Markdown renderer for the brief.
 *
 * Output is channel-neutral legacy Markdown (works in Telegram parse_mode
 * "Markdown" today; safe enough for WhatsApp / email / web preview later).
 *
 * No I/O, no LLM call, no Telegram-specific framing. Deterministic.
 */
import type { BriefJson } from "./schema";

export interface RenderOptions {
  /** If true, prefix the brief with a "🌾 Cadence" wordmark line. Default true. */
  includeBrand?: boolean;
}

export function renderBriefMarkdown(
  brief: BriefJson,
  opts: RenderOptions = {}
): string {
  const includeBrand = opts.includeBrand ?? true;
  const lines: string[] = [];

  // Header
  if (includeBrand) {
    lines.push(
      `🌾 *Cadence* · ${brief.header.cadence_label} · ${brief.header.date}`
    );
  } else {
    lines.push(`*${brief.header.cadence_label} · ${brief.header.date}*`);
  }
  lines.push(brief.header.industry);
  lines.push(`_Tuned for: ${brief.header.personalization_summary}_`);
  lines.push("");

  // TL;DR
  lines.push(`*TL;DR* — ${brief.tldr}`);
  lines.push("");

  // Sections
  for (const section of brief.sections) {
    lines.push(`*${section.heading}*`);
    for (const bullet of section.bullets) {
      const markers = bullet.citation_markers
        .filter((n) => !new RegExp(`\\[${n}\\]`).test(bullet.text))
        .map((n) => `[${n}]`)
        .join("");
      const suffix = markers ? ` ${markers}` : "";
      lines.push(`• ${bullet.text}${suffix}`);
    }
    lines.push("");
  }

  // Why it matters
  lines.push(`*Why this matters to you*`);
  lines.push(brief.why_it_matters);
  lines.push("");

  // Feedback CTA
  lines.push(`_${brief.feedback_cta}_`);
  lines.push("");

  // Sources
  lines.push(`*Sources*`);
  for (const src of [...brief.sources].sort((a, b) => a.marker - b.marker)) {
    lines.push(`[${src.marker}] ${src.title} — ${src.url}`);
  }

  return lines.join("\n").trimEnd() + "\n";
}
