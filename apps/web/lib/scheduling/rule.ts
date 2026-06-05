/**
 * Multi-brief scheduling rule v1 — canonical shape stored on
 * `digest_specs.scheduling` jsonb.
 *
 * Per techdesign §scheduling-rule-model. The discriminated cadence union
 * covers daily/weekly/monthly/custom_cron; `skipDates` and `skipWhen`
 * carry holiday + weekend toggles.
 *
 * Snapshot-immutable timezone per spec (NOT per user): a power user can
 * have one brief in Asia/Kuala_Lumpur and another in America/New_York.
 *
 * Faeez decisions locked 2026-06-05:
 *   - custom_cron is Pro-tier only (UI gate, not schema-enforced here).
 *   - holiday calendar: boolean `malaysianPublicHolidays` only for v1.
 */
import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const schedulingRuleV1 = z
  .object({
    version: z.literal(1),
    /** Inclusive lower bound; UTC-projected date in spec's timezone. */
    startDate: z.string().regex(DATE_RE),
    /** Inclusive upper bound; null = open-ended. */
    endDate: z.string().regex(DATE_RE).nullable().default(null),
    /** "HH:MM" 24h, in `timezone`. */
    timeLocal: z.string().regex(HHMM_RE),
    /** IANA tz, e.g. "Asia/Kuala_Lumpur". Snapshotted at create time. */
    timezone: z.string().min(1),
    cadence: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("daily"),
        /** ISO weekday filter (1=Mon..7=Sun). Default = every day. */
        weekdays: z
          .array(z.number().int().min(1).max(7))
          .default([1, 2, 3, 4, 5, 6, 7]),
      }),
      z.object({
        kind: z.literal("weekly"),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1),
      }),
      z.object({
        kind: z.literal("monthly"),
        /** 1..28 or "last" to dodge Feb 30 footgun. */
        monthlyDay: z.union([z.number().int().min(1).max(28), z.literal("last")]),
      }),
      z.object({
        kind: z.literal("custom_cron"),
        /** 5-field UTC cron; Pro-tier gated in UI. */
        cronExpr: z.string().min(1),
      }),
    ]),
    /** Ad-hoc YYYY-MM-DD dates to skip. */
    skipDates: z.array(z.string().regex(DATE_RE)).default([]),
    skipWhen: z
      .object({
        weekends: z.boolean().optional(),
        malaysianPublicHolidays: z.boolean().optional(),
      })
      .default({}),
  })
  .strict();

export type SchedulingRuleV1 = z.infer<typeof schedulingRuleV1>;
export type SchedulingRuleInput = z.input<typeof schedulingRuleV1>;

/**
 * Best-effort coercion from a legacy `spec.cadence` blob into a
 * SchedulingRuleV1. Used by migration 0024 backfill AND any new write
 * path that hasn't been ported to the new shape yet.
 */
export function ruleFromLegacyCadence(args: {
  cadence: { frequency?: string; delivery_time_local?: string; days_of_week?: number[] };
  timezone: string;
  startDate: string;
}): SchedulingRuleV1 {
  const freq = args.cadence.frequency ?? "daily";
  const time = args.cadence.delivery_time_local ?? "08:00";
  const dow = args.cadence.days_of_week ?? [1, 2, 3, 4, 5];
  let cadence: SchedulingRuleV1["cadence"];
  if (freq === "weekly") {
    cadence = { kind: "weekly", weekdays: dow.length > 0 ? dow : [1] };
  } else if (freq === "monthly") {
    cadence = { kind: "monthly", monthlyDay: 1 };
  } else {
    cadence = { kind: "daily", weekdays: dow };
  }
  return schedulingRuleV1.parse({
    version: 1,
    startDate: args.startDate,
    endDate: null,
    timeLocal: time,
    timezone: args.timezone,
    cadence,
    skipDates: [],
    skipWhen: {},
  });
}
