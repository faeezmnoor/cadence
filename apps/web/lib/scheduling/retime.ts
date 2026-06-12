/**
 * Settings-surfacing v1 (WS-A): timezone re-derivation helper.
 *
 * When a user changes `users.timezone`, every active brief's scheduling
 * rule (which snapshots a timezone per spec — see lib/scheduling/rule.ts)
 * must be re-anchored to the new zone and its `next_run_at` re-derived,
 * or deliveries keep firing at the old UTC offset forever.
 *
 * Pure — no DB, no clock (caller passes `now`). Mirrors the scheduling
 * path used by save-spec.ts (`ruleFromLegacyCadence` + evaluator
 * `nextRunAt`) with one refinement: when the persisted scheduling rule is
 * a valid SchedulingRuleV1 we PRESERVE it (skipDates, skipWhen, startDate,
 * custom cadence shapes from raw edits) and only swap the timezone —
 * rebuilding from the legacy `spec.cadence` blob would silently drop
 * those richer fields. The legacy rebuild is the fallback for rows whose
 * scheduling jsonb predates Phase A or fails validation.
 *
 * PRD §4.1 re-derivation rule: if the local delivery time has already
 * passed today in the new zone, the next delivery is the next valid
 * occurrence (tomorrow / next scheduled day) — never two deliveries on
 * one local calendar day, never a skip longer than one cycle. That is
 * exactly the evaluator's `nextRunAt` contract (strictly-after search),
 * so this helper adds no occurrence math of its own.
 */
import {
  ruleFromLegacyCadence,
  schedulingRuleV1,
  type SchedulingRuleV1,
} from "./rule";
import { nextRunAt } from "./evaluator";

export interface RetimeArgs {
  /** Legacy cadence blob from the spec (DigestSpecV1.cadence). */
  cadence?: {
    frequency?: string;
    delivery_time_local?: string;
    days_of_week?: number[];
  };
  /** Persisted digest_specs.scheduling jsonb (may be invalid/legacy). */
  existingScheduling?: unknown;
  /** The user's NEW IANA timezone. */
  timezone: string;
  /** Evaluation instant (UTC). */
  now: Date;
}

export interface RetimeResult {
  scheduling: SchedulingRuleV1;
  nextRunAt: Date | null;
}

export function rederiveScheduleForTimezone(args: RetimeArgs): RetimeResult {
  const parsed = schedulingRuleV1.safeParse(args.existingScheduling);
  const scheduling: SchedulingRuleV1 = parsed.success
    ? { ...parsed.data, timezone: args.timezone }
    : ruleFromLegacyCadence({
        cadence: args.cadence ?? {},
        timezone: args.timezone,
        startDate: args.now.toISOString().slice(0, 10),
      });
  return {
    scheduling,
    nextRunAt: nextRunAt(scheduling, args.now),
  };
}

/**
 * Validate an IANA timezone id against the runtime's zone table.
 * `Intl.supportedValuesOf("timeZone")` is the canonical list (Node ≥ 18 /
 * all evergreen browsers); the Set is built once per process.
 */
let zoneSet: Set<string> | null = null;
export function isValidIanaTimezone(tz: string): boolean {
  if (!zoneSet) {
    zoneSet = new Set(Intl.supportedValuesOf("timeZone"));
  }
  return zoneSet.has(tz);
}
