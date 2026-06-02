/**
 * T-301: pure tz-aware delivery matching.
 *
 * Given the current UTC minute and a (user_tz, spec_cadence) tuple, decide
 * whether the spec should fire NOW. Pure function — no DB, no clock — so the
 * dispatcher can call it in a loop and tests can exhaustively probe edge
 * cases (DST jumps, weekly windows, month-rollover) without a real clock.
 *
 * Implementation note: we use the `en-CA` locale + Intl.DateTimeFormat to
 * project a UTC instant into the target IANA zone without pulling a
 * full tz library (luxon / date-fns-tz) into the Vercel bundle. en-CA
 * gives ISO-shaped `YYYY-MM-DD, HH:MM:SS` strings which are trivially
 * parseable and stable across Node versions.
 */

import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

export interface ZonedNow {
  /** "YYYY-MM-DD" in target tz */
  date: string;
  /** "HH:MM" in target tz, 24-hour */
  hhmm: string;
  /** ISO weekday in target tz: 1=Mon..7=Sun */
  weekday: number;
  /** Day of month in target tz, 1..31 */
  day: number;
}

/**
 * Project a UTC instant into an IANA timezone. Returns the components the
 * cadence matcher needs. Pure — exported for tests.
 */
export function projectToZone(nowUtc: Date, timezone: string): ZonedNow {
  // en-CA returns "YYYY-MM-DD, HH:MM:SS" — stable, parseable, locale-free.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = fmt.formatToParts(nowUtc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  const minute = get("minute");
  const weekdayShort = get("weekday"); // Mon, Tue, ...

  // Intl can return "24" for midnight in some locales/zones; normalize.
  if (hour === "24") hour = "00";

  const WEEKDAY_TO_ISO: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const weekday = WEEKDAY_TO_ISO[weekdayShort] ?? 0;

  return {
    date: `${year}-${month}-${day}`,
    hhmm: `${hour}:${minute}`,
    weekday,
    day: Number(day),
  };
}

/**
 * Truncate a Date to the start of its UTC minute. The result is the
 * canonical `delivery_minute_utc` value the dispatcher INSERTs.
 */
export function truncateToUtcMinute(d: Date): Date {
  const t = d.getTime();
  return new Date(t - (t % 60000));
}

export interface MatchInput {
  nowUtc: Date;
  timezone: string;
  cadence: DigestSpecV1["cadence"];
  /**
   * For "monthly" frequency: which day-of-month to fire on. Phase 3 MVP
   * convention: monthly fires on the 1st. We codify it here so the
   * dispatcher and tests share one truth.
   */
  monthlyDayOfMonth?: number;
}

/**
 * Does this spec fire at this UTC minute?
 *
 * Rules:
 *  - HH:MM in user's tz must equal `cadence.delivery_time_local` exactly.
 *  - Weekly cadence honours `days_of_week`.
 *  - Daily cadence ignores `days_of_week` ONLY if it's the default [1..7];
 *    if user explicitly set weekdays-only [1..5], we honour that too.
 *    (Matches what the config agent persists.)
 *  - Monthly fires on `monthlyDayOfMonth` (default 1).
 */
export function shouldFire(input: MatchInput): boolean {
  const { nowUtc, timezone, cadence } = input;
  const zoned = projectToZone(nowUtc, timezone);

  if (zoned.hhmm !== cadence.delivery_time_local) return false;

  // days_of_week filter applies to daily + weekly. Monthly uses day-of-month.
  if (cadence.frequency === "monthly") {
    const target = input.monthlyDayOfMonth ?? 1;
    return zoned.day === target;
  }

  const dow = cadence.days_of_week ?? [1, 2, 3, 4, 5];
  if (!dow.includes(zoned.weekday)) return false;

  return true;
}
