/**
 * Pure scheduling evaluator for the multi-brief dispatcher.
 *
 * Two exports:
 *   - `shouldFire(rule, nowUtc)`: correctness gate at dispatch time.
 *   - `nextRunAt(rule, fromUtc)`: materialized hint persisted on
 *     `digest_specs.next_run_at` for the SQL early-filter.
 *
 * Pure — no DB, no clock, no env. Tz projection reuses
 * `server/cron/match.ts :: projectToZone` so we have ONE tz code path
 * across legacy and multi-brief. Holidays use a static checked-in JSON
 * table (TODO: ship `data/my-public-holidays-2026-2030.json`; for now the
 * function returns false when the table is missing so deliveries don't
 * silently disappear).
 */
import { projectToZone } from "@/server/cron/match";
import type { SchedulingRuleV1 } from "./rule";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_SEARCH_MINUTES = 60 * 24 * 400; // ~13 months of forward search

/**
 * Is `date` (YYYY-MM-DD) a Malaysian public holiday?
 *
 * v1: returns false. Stub kept so the call sites are wired and the
 * data file can land in a follow-up without touching the evaluator.
 */
function isMyHoliday(_date: string): boolean {
  return false;
}

function isWeekend(weekday: number): boolean {
  return weekday === 6 || weekday === 7;
}

function daysInMonth(year: number, month1to12: number): number {
  // month1to12 is 1..12; new Date(year, month, 0) returns last day of prev month
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function isWithinDateWindow(rule: SchedulingRuleV1, localDate: string): boolean {
  if (localDate < rule.startDate) return false;
  if (rule.endDate && localDate > rule.endDate) return false;
  return true;
}

function passesSkipFilters(rule: SchedulingRuleV1, localDate: string, weekday: number): boolean {
  if (rule.skipDates.includes(localDate)) return false;
  if (rule.skipWhen.weekends && isWeekend(weekday)) return false;
  if (rule.skipWhen.malaysianPublicHolidays && isMyHoliday(localDate)) return false;
  return true;
}

function cadenceMatches(rule: SchedulingRuleV1, weekday: number, dayOfMonth: number, monthLen: number): boolean {
  switch (rule.cadence.kind) {
    case "daily":
      return rule.cadence.weekdays.includes(weekday);
    case "weekly":
      return rule.cadence.weekdays.includes(weekday);
    case "monthly": {
      const target =
        rule.cadence.monthlyDay === "last" ? monthLen : rule.cadence.monthlyDay;
      return dayOfMonth === target;
    }
    case "custom_cron":
      // Custom cron is evaluated against UTC instants by `shouldFire`/
      // `nextRunAt` directly — this fn is only consulted for the
      // discrete-cadence kinds. Treat as a non-match here; the caller
      // routes around it.
      return false;
  }
}

/**
 * Does the rule fire at exactly `nowUtc` (truncated to the minute)?
 *
 * Correctness gate: the dispatcher's SQL early-filter narrows by
 * `next_run_at <= now()`, then this function double-checks against the
 * live rule (which may have been edited since `next_run_at` was last
 * computed — e.g. user added a skipDate).
 */
export function shouldFire(rule: SchedulingRuleV1, nowUtc: Date): boolean {
  // custom_cron has its own path (UTC cron, no tz wobble).
  if (rule.cadence.kind === "custom_cron") {
    return cronMatchesMinute(rule.cadence.cronExpr, nowUtc);
  }
  const zoned = projectToZone(nowUtc, rule.timezone);
  if (zoned.hhmm !== rule.timeLocal) return false;
  if (!isWithinDateWindow(rule, zoned.date)) return false;
  if (!passesSkipFilters(rule, zoned.date, zoned.weekday)) return false;
  const monthLen = daysInMonth(
    Number(zoned.date.slice(0, 4)),
    Number(zoned.date.slice(5, 7))
  );
  return cadenceMatches(rule, zoned.weekday, zoned.day, monthLen);
}

/**
 * The next UTC minute (>= fromUtc, exclusive of fromUtc itself when
 * fromUtc is already on a minute boundary) at which `shouldFire` returns
 * true. Returns null when:
 *   - endDate is in the past, OR
 *   - search exceeds MAX_SEARCH_MINUTES with no hit (defensive).
 *
 * Forward-search strategy: jump in hour-aligned increments toward the
 * spec's local `timeLocal` rather than scanning minute-by-minute. The
 * pure brute force is fast enough at <1ms/spec, but a smarter walk keeps
 * the test suite fast and surfaces bugs faster.
 */
export function nextRunAt(rule: SchedulingRuleV1, fromUtc: Date): Date | null {
  // custom_cron: minute-granular search bounded by MAX_SEARCH_MINUTES.
  if (rule.cadence.kind === "custom_cron") {
    let t = Math.floor(fromUtc.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
    const end = t + MAX_SEARCH_MINUTES * MINUTE_MS;
    while (t < end) {
      const d = new Date(t);
      if (cronMatchesMinute(rule.cadence.cronExpr, d)) return d;
      t += MINUTE_MS;
    }
    return null;
  }

  // Discrete cadences: walk hour-by-hour, project into local tz, and
  // check both "right minute-of-hour" and "right local date".
  const [hh, mm] = rule.timeLocal.split(":").map((s) => Number(s));
  let cursor = new Date(Math.floor(fromUtc.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS);
  const horizon = cursor.getTime() + MAX_SEARCH_MINUTES * MINUTE_MS;

  while (cursor.getTime() < horizon) {
    const zoned = projectToZone(cursor, rule.timezone);
    // Quick out: outside the date window.
    if (rule.endDate && zoned.date > rule.endDate) return null;

    // Align to the target HH:MM in local time. If we're not there yet,
    // jump ahead in minute increments toward the target — but stay
    // bounded so a tz with weird DST doesn't loop forever.
    if (zoned.hhmm === rule.timeLocal) {
      if (
        isWithinDateWindow(rule, zoned.date) &&
        passesSkipFilters(rule, zoned.date, zoned.weekday)
      ) {
        const monthLen = daysInMonth(
          Number(zoned.date.slice(0, 4)),
          Number(zoned.date.slice(5, 7))
        );
        if (cadenceMatches(rule, zoned.weekday, zoned.day, monthLen)) {
          return cursor;
        }
      }
      // Wrong day; skip a full day forward to reduce iterations.
      cursor = new Date(cursor.getTime() + 24 * HOUR_MS - MINUTE_MS);
    } else {
      // Compute minutes-until-target inside the local day. DST means we
      // can't trust pure arithmetic, so walk one minute at a time when
      // we're already within the same local hour — but jump an hour
      // when we're not.
      const localMins = Number(zoned.hhmm.slice(0, 2)) * 60 + Number(zoned.hhmm.slice(3, 5));
      const targetMins = hh! * 60 + mm!;
      const diff = targetMins - localMins;
      if (diff > 0 && diff < 120) {
        cursor = new Date(cursor.getTime() + diff * MINUTE_MS);
      } else if (zoned.hhmm.endsWith(":59") || zoned.hhmm.endsWith(":00")) {
        cursor = new Date(cursor.getTime() + MINUTE_MS);
      } else {
        // Round up to the next minute and try again.
        cursor = new Date(cursor.getTime() + MINUTE_MS);
      }
    }
  }
  return null;
}

/**
 * Minimal 5-field cron matcher (m h dom mon dow) interpreted in UTC.
 * Supports: star, N, N-M, comma lists, and step syntax. Sufficient for the Pro-tier
 * custom_cron escape hatch. Anything richer should bring a real lib.
 *
 * Exported for tests.
 */
export function cronMatchesMinute(expr: string, nowUtc: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const minute = nowUtc.getUTCMinutes();
  const hour = nowUtc.getUTCHours();
  const dom = nowUtc.getUTCDate();
  // cron months are 1..12; JS getUTCMonth is 0..11
  const mon = nowUtc.getUTCMonth() + 1;
  // cron dow: 0=Sun..6=Sat; ISO 1=Mon..7=Sun. Convert both ways.
  const isoWeekday = ((nowUtc.getUTCDay() + 6) % 7) + 1; // Sun=0->7, Mon=1->1
  const cronDow = nowUtc.getUTCDay(); // 0..6

  return (
    fieldMatches(fields[0]!, minute, 0, 59) &&
    fieldMatches(fields[1]!, hour, 0, 23) &&
    fieldMatches(fields[2]!, dom, 1, 31) &&
    fieldMatches(fields[3]!, mon, 1, 12) &&
    (fieldMatches(fields[4]!, cronDow, 0, 6) ||
      // Accept ISO 1..7 form for resilience (some users write Mon=1..Sun=7).
      fieldMatches(fields[4]!, isoWeekday, 1, 7))
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  for (const part of field.split(",")) {
    if (matchPart(part, value, min, max)) return true;
  }
  return false;
}

function matchPart(part: string, value: number, min: number, max: number): boolean {
  let step = 1;
  let body = part;
  const slash = part.indexOf("/");
  if (slash !== -1) {
    step = Number(part.slice(slash + 1));
    body = part.slice(0, slash);
    if (!Number.isFinite(step) || step <= 0) return false;
  }
  let lo: number, hi: number;
  if (body === "*" || body === "") {
    lo = min;
    hi = max;
  } else if (body.includes("-")) {
    const [a, b] = body.split("-").map((s) => Number(s));
    if (!Number.isFinite(a!) || !Number.isFinite(b!)) return false;
    lo = a!;
    hi = b!;
  } else {
    const n = Number(body);
    if (!Number.isFinite(n)) return false;
    return n === value && (value - min) % step === 0;
  }
  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}
