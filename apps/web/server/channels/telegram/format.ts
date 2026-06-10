/**
 * Telegram formatter + splitter (T-209, CAD-32).
 *
 * Pure module — no I/O. Given composer markdown, returns N <= 4096-char
 * parts that Telegram's sendMessage accepts. The split algorithm itself
 * is channel-agnostic and lives in `../split.ts` (extracted in CAD-207);
 * this module pins the Telegram caps and parse-mode policy.
 *
 * Cadence target cap is 3800 (slightly under Telegram's 4096) so the
 * composer aims for one part. When the composer overruns we split safely.
 */
import { splitMarkdown } from "../split";

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
  return splitMarkdown(input, cap);
}
