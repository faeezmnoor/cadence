/**
 * UX P0 #2: sample brief variant.
 *
 * The sample brief (auto-fired post-Telegram-link OR triggered via
 * `digest.sampleNow`) currently looks identical to a scheduled brief.
 * First-time users have no anchor for "what tomorrow looks like" — they
 * see today's brief and assume that IS the product, missing the cadence
 * promise (and missing the call to start tuning).
 *
 * We prepend a small banner block so the sample brief reads as a sample:
 *  - Names it explicitly ("This is your SAMPLE brief")
 *  - Sets the expectation for the scheduled cadence (when + where)
 *  - Invites the very first tuning signal (👍/👎 or /tune)
 *
 * Pure function so the unit test can lock both the copy and the
 * "scheduled briefs MUST NOT carry this banner" invariant.
 */

import type { Cadence } from "@/server/billing/low-balance-footer";

export interface SampleBannerInput {
  /** "daily" | "weekly" | "monthly" — from spec.cadence.frequency */
  frequency: Cadence;
  /** "HH:MM" local time. Falls back to a generic line if absent. */
  deliveryTimeLocal?: string | null;
  /** IANA tz string for human-readable footer. Optional. */
  timezone?: string | null;
}

/**
 * Render the sample-brief preamble. Returned string already includes a
 * trailing blank-line separator so callers can prepend it directly to the
 * composer markdown.
 */
export function buildSampleBanner(input: SampleBannerInput): string {
  const cadenceWord =
    input.frequency === "weekly"
      ? "every week"
      : input.frequency === "monthly"
        ? "every month"
        : "every day";

  // Time + tz line is best-effort. If we don't have a delivery_time_local
  // we still want to set the cadence expectation, so we degrade gracefully.
  const timeFragment = input.deliveryTimeLocal
    ? ` at ${input.deliveryTimeLocal}`
    : "";
  const tzFragment = input.timezone ? ` (${input.timezone})` : "";

  const lines = [
    "✨ *This is your SAMPLE brief.*",
    `Your real briefs land ${cadenceWord}${timeFragment}${tzFragment}.`,
    "Tap 👍 / 👎 below to start tuning — or reply /tune to adjust.",
  ];

  // Two trailing newlines so the actual brief markdown starts cleanly.
  return lines.join("\n") + "\n\n";
}
