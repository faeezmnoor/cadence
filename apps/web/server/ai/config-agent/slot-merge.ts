/**
 * Slot-precedence merge — pure function (blueprint §3.2).
 *
 * Inputs:
 *  - draft:     the existing DigestSpecDraft (from chat_threads.draft_spec)
 *  - extracted: the latest extractor output for this turn
 *
 * Output:
 *  - applied:   draft slots merged with HIGH-confidence updates
 *  - proposed:  MED-confidence slots NOT applied; surfaced to the agent as
 *               a "you might want to confirm" block for chip confirmation
 *  - dropped:   LOW-confidence slots ignored
 *
 * Precedence (slot-by-slot):
 *  1. If extractor source = "explicit" → overwrite (user's latest words win).
 *  2. If extractor source = "inferred" AND existing draft has a value
 *     (any source) → keep existing draft value.
 *  3. If extractor source = "inferred" AND existing draft has nothing →
 *     accept inferred value at HIGH; propose at MED; drop at LOW.
 *
 * The draft schema doesn't carry per-slot provenance, so rule 2 collapses
 * to "any draft value blocks an inferred overwrite". This is the right
 * default: once a user explicitly types a frequency, an inferred guess on
 * a later turn shouldn't silently flip it.
 */
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";
import { HIGH_CONF, MED_CONF, type ExtractedSlots } from "./extract-schema";

export type AppliedSlots = {
  topics?: string[];
  frequency?: "daily" | "weekly" | "monthly";
  delivery_time_local?: string;
  days_of_week?: number[];
  language?: "en" | "ms" | "zh";
  tone_preset?:
    | "executive_brief"
    | "analyst_deep_dive"
    | "trader_quick_take"
    | "casual_newsletter";
  length_target?: "short" | "medium" | "long";
};

export type ProposedSlots = AppliedSlots & { __confidence?: Record<string, number> };

export interface MergeResult {
  draft: DigestSpecDraft;
  applied: AppliedSlots;
  proposed: AppliedSlots;
  dropped: AppliedSlots;
}

function hasTopics(d: DigestSpecDraft | undefined): boolean {
  return !!d?.topics && d.topics.length > 0;
}

function hasCadence(d: DigestSpecDraft | undefined, key: "frequency" | "delivery_time_local" | "days_of_week"): boolean {
  return !!d?.cadence && d.cadence[key] !== undefined && d.cadence[key] !== null;
}

/**
 * Cadence safety defaults for partial writes.
 *
 * The strict spec requires all three cadence fields together, and the
 * draft schema rejects a cadence object missing required leaves. So when
 * the extractor lands a partial cadence (just frequency, or just time),
 * we fill in safe defaults for the rest — same defaults the empty-spec
 * helper uses. The agent can still overwrite them via `update_spec_field`
 * before save, and the user sees them in the spec sidebar so they're not
 * a silent decision.
 */
type CadenceShape = NonNullable<DigestSpecDraft["cadence"]>;
const CADENCE_DEFAULTS: CadenceShape = {
  frequency: "daily",
  delivery_time_local: "08:00",
  days_of_week: [1, 2, 3, 4, 5],
};

function applyCadenceField<K extends keyof CadenceShape>(
  existing: DigestSpecDraft["cadence"] | undefined,
  key: K,
  value: CadenceShape[K]
): DigestSpecDraft["cadence"] {
  return {
    frequency: existing?.frequency ?? CADENCE_DEFAULTS.frequency,
    delivery_time_local:
      existing?.delivery_time_local ?? CADENCE_DEFAULTS.delivery_time_local,
    days_of_week: existing?.days_of_week ?? CADENCE_DEFAULTS.days_of_week,
    [key]: value,
  } as DigestSpecDraft["cadence"];
}

/** Decide if an extractor entry should be applied / proposed / dropped. */
function decide(
  source: "explicit" | "inferred",
  confidence: number,
  draftHas: boolean
): "apply" | "propose" | "drop" {
  // Rule 2: inferred guess can never overwrite a populated draft slot.
  if (source === "inferred" && draftHas) return "drop";
  // Threshold gates.
  if (confidence >= HIGH_CONF) return "apply";
  if (confidence >= MED_CONF) return "propose";
  return "drop";
}

export function mergeExtractedSlots(
  draft: DigestSpecDraft | undefined,
  extracted: ExtractedSlots
): MergeResult {
  const next: DigestSpecDraft = {
    ...(draft ?? {}),
    cadence: draft?.cadence ? { ...draft.cadence } : undefined,
  } as DigestSpecDraft;
  const applied: AppliedSlots = {};
  const proposed: AppliedSlots = {};
  const dropped: AppliedSlots = {};

  // topics — either extracted.topics OR fall back to extracted.industry
  // when topics is absent. Industry becomes a single-topic seed.
  const topicsSlot =
    extracted.topics ??
    (extracted.industry
      ? {
          value: [extracted.industry.value],
          confidence: extracted.industry.confidence,
          source: extracted.industry.source,
        }
      : undefined);
  if (topicsSlot) {
    const verdict = decide(topicsSlot.source, topicsSlot.confidence, hasTopics(draft));
    if (verdict === "apply") {
      next.topics = topicsSlot.value;
      applied.topics = topicsSlot.value;
    } else if (verdict === "propose") {
      proposed.topics = topicsSlot.value;
    } else {
      dropped.topics = topicsSlot.value;
    }
  }

  // cadence.frequency
  if (extracted.frequency) {
    const v = decide(
      extracted.frequency.source,
      extracted.frequency.confidence,
      hasCadence(draft, "frequency")
    );
    if (v === "apply") {
      next.cadence = applyCadenceField(next.cadence, "frequency", extracted.frequency.value);
      applied.frequency = extracted.frequency.value;
    } else if (v === "propose") {
      proposed.frequency = extracted.frequency.value;
    } else {
      dropped.frequency = extracted.frequency.value;
    }
  }

  // cadence.delivery_time_local
  if (extracted.delivery_time_local) {
    const v = decide(
      extracted.delivery_time_local.source,
      extracted.delivery_time_local.confidence,
      hasCadence(draft, "delivery_time_local")
    );
    if (v === "apply") {
      next.cadence = applyCadenceField(
        next.cadence,
        "delivery_time_local",
        extracted.delivery_time_local.value
      );
      applied.delivery_time_local = extracted.delivery_time_local.value;
    } else if (v === "propose") {
      proposed.delivery_time_local = extracted.delivery_time_local.value;
    } else {
      dropped.delivery_time_local = extracted.delivery_time_local.value;
    }
  }

  // cadence.days_of_week
  if (extracted.days_of_week) {
    const v = decide(
      extracted.days_of_week.source,
      extracted.days_of_week.confidence,
      hasCadence(draft, "days_of_week")
    );
    if (v === "apply") {
      next.cadence = applyCadenceField(
        next.cadence,
        "days_of_week",
        extracted.days_of_week.value
      );
      applied.days_of_week = extracted.days_of_week.value;
    } else if (v === "propose") {
      proposed.days_of_week = extracted.days_of_week.value;
    } else {
      dropped.days_of_week = extracted.days_of_week.value;
    }
  }

  // language — IMPORTANT positioning lie risk: we only deliver in English
  // today (see chat-client.tsx Stream E #7). Even if the extractor confidently
  // pulls "Malay", we DO NOT apply it to the draft. We propose it as a chip
  // so the agent can route through the language-interest funnel.
  if (extracted.language) {
    if (extracted.language.value === "en") {
      const v = decide(
        extracted.language.source,
        extracted.language.confidence,
        !!draft?.language
      );
      if (v === "apply") {
        next.language = "en";
        applied.language = "en";
      } else if (v === "propose") {
        proposed.language = "en";
      } else {
        dropped.language = "en";
      }
    } else {
      // ms / zh: never auto-apply.
      if (extracted.language.confidence >= MED_CONF) {
        proposed.language = extracted.language.value;
      } else {
        dropped.language = extracted.language.value;
      }
    }
  }

  // tone_preset
  if (extracted.tone_preset) {
    const v = decide(
      extracted.tone_preset.source,
      extracted.tone_preset.confidence,
      !!draft?.tone_preset
    );
    if (v === "apply") {
      next.tone_preset = extracted.tone_preset.value;
      applied.tone_preset = extracted.tone_preset.value;
    } else if (v === "propose") {
      proposed.tone_preset = extracted.tone_preset.value;
    } else {
      dropped.tone_preset = extracted.tone_preset.value;
    }
  }

  // length_target
  if (extracted.length_target) {
    const v = decide(
      extracted.length_target.source,
      extracted.length_target.confidence,
      !!draft?.length_target
    );
    if (v === "apply") {
      next.length_target = extracted.length_target.value;
      applied.length_target = extracted.length_target.value;
    } else if (v === "propose") {
      proposed.length_target = extracted.length_target.value;
    } else {
      dropped.length_target = extracted.length_target.value;
    }
  }

  return { draft: next, applied, proposed, dropped };
}

/**
 * True if anything was applied (used by route to decide whether to bother
 * writing draft_spec back to the DB).
 */
export function anyApplied(a: AppliedSlots): boolean {
  return Object.keys(a).length > 0;
}

/**
 * True if anything was proposed (used to render PRIOR CONTEXT block).
 */
export function anyProposed(p: AppliedSlots): boolean {
  return Object.keys(p).length > 0;
}
