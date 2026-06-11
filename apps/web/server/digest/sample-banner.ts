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

  // Wave 4 CMO copy diff §8: lighter, friendlier banner. "SAMPLE" in caps
  // shouted "this isn't the real thing" before the user had read it; the
  // new copy frames it as a try and drops the /tune slash-syntax from the
  // cold-visitor surface. The fully topic-native intro lives in the
  // composer prompt (follow-up — tracked in QUEUED-WORK).
  const lines = [
    "✨ *Thanks for trying Cadence — here's your first sample.*",
    `Your real briefs land ${cadenceWord}${timeFragment}${tzFragment}.`,
    // CAD-212: samples are free (no debit, see run.ts) and votes are wired
    // into the learning loop (CAD-211) — this line is now literally true.
    "This sample is free — it doesn't use your credits. React 👍 / 👎 below and I'll shape your next brief around it.",
  ];

  // Two trailing newlines so the actual brief markdown starts cleanly.
  return lines.join("\n") + "\n\n";
}
