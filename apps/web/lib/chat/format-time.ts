/**
 * Chat timestamp formatter.
 *
 * Display rule (matches ChatGPT + Claude conventions, locked in
 * blueprint/chat-ux-parity-v1.md §2.2):
 *
 *   < 60s            → "just now"
 *   1–59 min         → "5m ago"
 *   today            → "8:13 AM"
 *   yesterday        → "Yesterday 8:13 AM"
 *   same ISO week    → "Mon 8:13 AM"
 *   older same year  → "Jun 8, 8:13 AM"
 *   earlier years    → "Jun 8 2025, 8:13 AM"
 *
 * The absolute tooltip ALWAYS shows the full locale-aware long form (used
 * by Timestamp's `title` attribute and `aria-label`).
 *
 * Date-separator label rules (top of a day group):
 *   today / yesterday / same-week day-name / "Jun 8" / "Jun 8, 2025"
 *
 * Pure functions — no Intl side effects, accept an explicit `now` for
 * deterministic tests.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffLocalDays(a: Date, b: Date): number {
  const da = startOfLocalDay(a).getTime();
  const db = startOfLocalDay(b).getTime();
  return Math.round((da - db) / DAY_MS);
}

function formatClock(d: Date): string {
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = ((hours + 11) % 12) + 1;
  const mm = String(minutes).padStart(2, "0");
  return `${h12}:${mm} ${period}`;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Relative-or-short-absolute meta-row text. Refer to top-of-file table.
 */
export function formatChatTime(when: Date, now: Date = new Date()): string {
  const deltaMs = now.getTime() - when.getTime();

  if (deltaMs < 60_000 && deltaMs >= -1000) return "just now";
  if (deltaMs < HOUR_MS && deltaMs >= 0) {
    const mins = Math.max(1, Math.floor(deltaMs / 60_000));
    return `${mins}m ago`;
  }

  if (isSameLocalDay(when, now)) return formatClock(when);

  const days = diffLocalDays(now, when);
  if (days === 1) return `Yesterday ${formatClock(when)}`;
  if (days > 1 && days <= 6) return `${DAY_SHORT[when.getDay()]} ${formatClock(when)}`;

  const sameYear = when.getFullYear() === now.getFullYear();
  if (sameYear) {
    return `${MONTH_SHORT[when.getMonth()]} ${when.getDate()}, ${formatClock(when)}`;
  }
  return `${MONTH_SHORT[when.getMonth()]} ${when.getDate()} ${when.getFullYear()}, ${formatClock(when)}`;
}

/**
 * Absolute long-form tooltip. Locale-aware via `Intl.DateTimeFormat` when
 * available, otherwise a deterministic fallback so tests stay stable.
 */
export function formatChatTimeAbsolute(when: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(when);
  } catch {
    // Fallback for environments where Intl isn't configured.
    return `${DAY_LONG[when.getDay()]}, ${MONTH_SHORT[when.getMonth()]} ${when.getDate()} ${when.getFullYear()} at ${formatClock(when)}`;
  }
}

/**
 * Date-separator label for the chip rendered between days.
 */
export function formatDateSeparator(when: Date, now: Date = new Date()): string {
  if (isSameLocalDay(when, now)) return "Today";
  const days = diffLocalDays(now, when);
  if (days === 1) return "Yesterday";
  if (days > 1 && days <= 6) return DAY_LONG[when.getDay()] ?? "";
  const sameYear = when.getFullYear() === now.getFullYear();
  if (sameYear) return `${MONTH_SHORT[when.getMonth()]} ${when.getDate()}`;
  return `${MONTH_SHORT[when.getMonth()]} ${when.getDate()}, ${when.getFullYear()}`;
}

/**
 * Returns true if `a` and `b` cross a calendar-day boundary in the local
 * timezone. Used to inject a separator chip into the rendered list.
 */
export function crossesDayBoundary(a: Date, b: Date): boolean {
  return !isSameLocalDay(a, b);
}
