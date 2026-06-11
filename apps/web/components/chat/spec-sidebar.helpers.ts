export type DraftLike = Record<string, unknown> | null;

export interface FieldRow {
  label: string;
  value: string | null;
}

function pickString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function pickArray(obj: unknown, key: string): unknown[] | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) && v.length > 0 ? v : null;
}

function prettyDays(days: unknown[]): string {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const ints = days
    .filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (ints.length === 0) return "";
  if (ints.length === 7) return "every day";
  if (
    ints.length === 5 &&
    ints[0] === 1 &&
    ints[1] === 2 &&
    ints[2] === 3 &&
    ints[3] === 4 &&
    ints[4] === 5
  ) {
    return "weekdays";
  }
  return ints.map((i) => names[i]).join(" ");
}

function prettyLanguage(code: string): string {
  if (code === "en") return "English";
  if (code === "ms") return "Bahasa Malaysia";
  if (code === "zh") return "中文";
  return code;
}

export function buildRows(draft: DraftLike): FieldRow[] {
  const cadence =
    draft && typeof draft === "object"
      ? (draft as Record<string, unknown>).cadence
      : undefined;

  const topics = pickArray(draft, "topics");
  const topicStr = topics
    ? topics
        .filter((t): t is string => typeof t === "string")
        .slice(0, 3)
        .join(", ")
    : null;

  const entities =
    draft && typeof draft === "object"
      ? (draft as Record<string, unknown>).entities
      : undefined;
  const companies = pickArray(entities, "companies") ?? [];
  const tickers = pickArray(entities, "tickers") ?? [];
  const keywords = pickArray(draft, "keywords_include") ?? [];
  const specificityPool = [...companies, ...tickers, ...keywords]
    .filter((v): v is string => typeof v === "string")
    .slice(0, 4);
  const specificity =
    specificityPool.length > 0 ? specificityPool.join(", ") : null;

  const frequency = pickString(cadence, "frequency");
  const time = pickString(cadence, "delivery_time_local");
  const days = pickArray(cadence, "days_of_week");
  const cadenceText =
    frequency || days
      ? [frequency, days ? prettyDays(days) : null].filter(Boolean).join(" · ")
      : null;

  const lang = pickString(draft, "language");

  return [
    { label: "Topic", value: topicStr },
    { label: "Specificity", value: specificity },
    { label: "Schedule", value: cadenceText },
    { label: "Delivery time", value: time },
    { label: "Channel", value: "Telegram" },
    { label: "Language", value: lang ? prettyLanguage(lang) : null },
  ];
}

/**
 * Design-review 2026-06-11 FINDING-001: the desktop rail is collapsible.
 * "Channel" is always set (Telegram-only MVP), so it can't count as
 * captured content — the rail should read as empty until the agent has
 * actually captured something from the conversation.
 */
export function hasDraftContent(rows: FieldRow[]): boolean {
  return rows.some((r) => r.label !== "Channel" && r.value != null);
}

/**
 * Effective open state for the desktop rail: a manual user toggle (persisted)
 * always wins; with no manual preference the rail opens exactly when there is
 * captured content to show. Pure so vitest can pin the matrix without jsdom.
 */
export function resolveRailOpen(
  manual: boolean | null,
  hasContent: boolean
): boolean {
  return manual ?? hasContent;
}

export function isReady(draft: DraftLike): boolean {
  if (!draft || typeof draft !== "object") return false;
  const d = draft as Record<string, unknown>;
  const cadence = d.cadence as Record<string, unknown> | undefined;
  const hasTopics = Array.isArray(d.topics) && d.topics.length > 0;
  const hasFreq = typeof cadence?.frequency === "string";
  const hasTime = typeof cadence?.delivery_time_local === "string";
  const hasLang = typeof d.language === "string";
  return hasTopics && hasFreq && hasTime && hasLang;
}
