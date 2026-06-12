/**
 * humanizeSchedule — shared SchedulingRuleV1 → human label (exec RC2,
 * manage-mode plan §4.7).
 *
 * Lifted VERBATIM from the two module-private duplicates in
 * app/briefs/briefs-client.tsx and app/briefs/[id]/brief-detail-client.tsx
 * (which could never be imported server-side). Pure, no React/client
 * imports — safe from server code (the manage-thread seed + transition
 * message) and client components alike, so chat and card schedule strings
 * cannot diverge (exec advisory 6).
 *
 * Outputs are pinned to the pre-lift behavior in test/schedule-humanize.test.ts.
 * Do NOT re-duplicate this into a component — no third copy, ever.
 */

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function humanizeSchedule(rule: unknown): string {
  if (!rule || typeof rule !== "object") return "Schedule not set";
  const r = rule as {
    cadence?: { kind?: string; weekdays?: number[]; monthlyDay?: number | "last"; cronExpr?: string };
    timeLocal?: string;
    timezone?: string;
  };
  const time = r.timeLocal ?? "";
  const tz = r.timezone ?? "";
  const tzLabel = tz ? ` (${tz})` : "";
  const c = r.cadence;
  if (!c) return "Schedule not set";

  if (c.kind === "daily") {
    const wd = c.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
    if (wd.length === 7) return `Daily at ${time}${tzLabel}`;
    if (wd.length === 5 && wd.every((d, i) => d === i + 1))
      return `Weekdays at ${time}${tzLabel}`;
    return `${wd.map((d) => DAY_NAMES[d]).join(", ")} at ${time}${tzLabel}`;
  }
  if (c.kind === "weekly") {
    const wd = c.weekdays ?? [];
    return `Weekly · ${wd.map((d) => DAY_NAMES[d]).join(", ")} at ${time}${tzLabel}`;
  }
  if (c.kind === "monthly") {
    const day = c.monthlyDay === "last" ? "last day" : `day ${c.monthlyDay}`;
    return `Monthly on ${day} at ${time}${tzLabel}`;
  }
  if (c.kind === "custom_cron") {
    return `Custom: ${c.cronExpr}${tzLabel}`;
  }
  return "Schedule not set";
}
