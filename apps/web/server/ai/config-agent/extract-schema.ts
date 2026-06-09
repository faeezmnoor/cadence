/**
 * Per-turn extractor schema (Workstream B / CAD-182).
 *
 * Defines the JSON shape gpt-4o-mini emits when given a user message +
 * the current draft snapshot. One row per slot, each carrying:
 *   - value:      the parsed slot value (typed per slot)
 *   - confidence: 0..1 calibrated by prompt examples
 *   - source:     "explicit" (user said it verbatim) vs "inferred"
 *
 * Industry isn't a spec column today — the draft has `topics[]`. We map
 * extractor-emitted `topics` directly into draft.topics. Industry, if
 * the model returns one, becomes the first topic.
 *
 * Blueprint §3.3.
 */
import { z } from "zod";

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const source = z.enum(["explicit", "inferred"]);
const confidence = z.number().min(0).max(1);

function withMeta<V extends z.ZodTypeAny>(value: V) {
  return z.object({ value, confidence, source }).optional();
}

export const extractorSchema = z.object({
  /** Plain-English industry hint, e.g. "palm oil" / "crypto". */
  industry: withMeta(z.string().min(1).max(80)),
  /**
   * Free-form topics the user named. If `industry` is present and `topics`
   * is empty, the merger treats industry as a single-topic seed.
   */
  topics: z
    .object({
      value: z.array(z.string().min(1).max(120)).min(1).max(10),
      confidence,
      source,
    })
    .optional(),
  frequency: withMeta(z.enum(["daily", "weekly", "monthly"])),
  delivery_time_local: withMeta(z.string().regex(HHMM_RE)),
  days_of_week: withMeta(
    z.array(z.number().int().min(1).max(7)).min(1).max(7)
  ),
  language: withMeta(z.enum(["en", "ms", "zh"])),
  tone_preset: withMeta(
    z.enum([
      "executive_brief",
      "analyst_deep_dive",
      "trader_quick_take",
      "casual_newsletter",
    ])
  ),
  length_target: withMeta(z.enum(["short", "medium", "long"])),
});

export type ExtractedSlots = z.infer<typeof extractorSchema>;

/** Per-slot threshold tiers (Faeez-approved). */
export const HIGH_CONF = 0.85;
export const MED_CONF = 0.5;

export type ConfTier = "high" | "med" | "low";

export function tierOf(c: number): ConfTier {
  if (c >= HIGH_CONF) return "high";
  if (c >= MED_CONF) return "med";
  return "low";
}
