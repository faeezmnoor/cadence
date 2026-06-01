/**
 * Telegram formatter + splitter (T-209, CAD-32).
 *
 * Pure module — no I/O. Given composer markdown, returns N <= 4096-char
 * parts that Telegram's sendMessage accepts. Split boundaries (preference
 * order):
 *   1. `## ` section headings
 *   2. blank lines (paragraph boundary)
 *   3. single newlines
 *   4. hard cut at HARD_CAP
 *
 * Cadence target cap is 3800 (slightly under Telegram's 4096) so the
 * composer aims for one part. When the composer overruns we split safely.
 */

export const TELEGRAM_HARD_CAP = 4096;
export const CADENCE_PART_CAP = 3800;

export type TelegramParseMode = "MarkdownV2" | "Markdown" | "HTML" | undefined;

export interface FormattedMessage {
  text: string;
  parseMode: TelegramParseMode;
}

/**
 * Format composer output for Telegram. Currently we ship as plain
 * `Markdown` (legacy) because composer output is structured but loose
 * (links + headings + lists) and MarkdownV2 would require escaping
 * every dash/period/parens. Legacy Markdown is forgiving and renders
 * the prose well enough.
 *
 * We append the inline-keyboard later in T-401, not here.
 */
export function formatComposerOutput(markdown: string): FormattedMessage[] {
  const parts = splitForTelegram(markdown, CADENCE_PART_CAP);
  return parts.map((text) => ({ text, parseMode: "Markdown" as const }));
}

/**
 * Split a long markdown string into <= cap-char chunks, preferring
 * section/paragraph/line boundaries.
 *
 * Exported separately for direct unit testing.
 */
export function splitForTelegram(input: string, cap = CADENCE_PART_CAP): string[] {
  const text = input.trimEnd();
  if (text.length === 0) return [];
  if (text.length <= cap) return [text];

  const parts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const remaining = text.length - cursor;
    if (remaining <= cap) {
      parts.push(text.slice(cursor).trim());
      break;
    }

    const window = text.slice(cursor, cursor + cap);
    const cut = pickCut(window);
    const chunk = text.slice(cursor, cursor + cut).trim();
    if (chunk.length > 0) parts.push(chunk);
    cursor += cut;
    // Skip leading whitespace at next cursor so we don't start a chunk with \n.
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
  }
  return parts;
}

/**
 * Within a `window` of up to `cap` chars, find the best split index.
 * Strategy (in order):
 *   1. Last occurrence of "\n## " (section heading) — split BEFORE it.
 *   2. Last "\n\n" — paragraph boundary.
 *   3. Last "\n" — line boundary.
 *   4. Hard cut at window length.
 *
 * Never split mid-link `[..](..)` or inside backtick code spans.
 */
function pickCut(window: string): number {
  // Try section heading boundary (not at index 0 — that would yield empty chunk).
  const headingIdx = window.lastIndexOf("\n## ");
  if (headingIdx > Math.floor(window.length * 0.3)) {
    return safeAdjust(window, headingIdx);
  }

  // Paragraph boundary.
  const paraIdx = window.lastIndexOf("\n\n");
  if (paraIdx > Math.floor(window.length * 0.3)) {
    return safeAdjust(window, paraIdx);
  }

  // Line boundary.
  const lineIdx = window.lastIndexOf("\n");
  if (lineIdx > Math.floor(window.length * 0.3)) {
    return safeAdjust(window, lineIdx);
  }

  // Hard cut, but pull back to last whitespace so we don't slice mid-word.
  const wsIdx = window.lastIndexOf(" ");
  if (wsIdx > Math.floor(window.length * 0.5)) {
    return safeAdjust(window, wsIdx);
  }

  return window.length;
}

/**
 * Pull `idx` back if it lands inside a markdown link or code span, so
 * the chunk doesn't break syntax. Conservative: scan unmatched `[`/`(`
 * and backticks in the candidate prefix.
 */
function safeAdjust(window: string, idx: number): number {
  const prefix = window.slice(0, idx);
  if (isInsideLink(prefix) || isInsideCode(prefix)) {
    // Walk backward to the last newline before the open marker.
    const backLine = prefix.lastIndexOf("\n");
    if (backLine > 0) return backLine;
    return idx;
  }
  return idx;
}

function isInsideLink(s: string): boolean {
  let open = 0;
  let inLink = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[") {
      open++;
      inLink = true;
    } else if (c === "]") {
      open = Math.max(0, open - 1);
      // The "](" pair finalizes a link; only counts when followed by "(".
      if (open === 0 && s[i + 1] === "(") {
        // skip to closing paren
        const close = s.indexOf(")", i + 2);
        if (close === -1) return true; // unterminated link
        i = close;
        inLink = false;
      }
    }
  }
  return inLink || open > 0;
}

function isInsideCode(s: string): boolean {
  // Crude but effective: odd count of backticks = currently open.
  let count = 0;
  for (const c of s) if (c === "`") count++;
  return count % 2 === 1;
}
