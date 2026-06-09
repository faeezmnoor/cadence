/**
 * PRIOR CONTEXT system-prompt addendum builder (Workstream B / CAD-182).
 *
 * Goals:
 *  - If the extractor JUST applied HIGH-conf slots, tell the agent to lead
 *    with a confirm-style line + chip strip ("Sounds like a daily crypto
 *    brief — want to start there?").
 *  - If the extractor PROPOSED MED-conf slots, tell the agent to confirm
 *    or ask, but DO NOT pre-fill them in the spec.
 *  - Always include the current draft snapshot so the agent doesn't
 *    re-ask filled slots.
 *
 * Empty string when there's nothing to say (no applied, no proposed, no
 * filled draft fields beyond the initial empty shape).
 *
 * Pure function — no side effects, easy to unit-test.
 */
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";
import { anyApplied, anyProposed, type AppliedSlots } from "./slot-merge";

const TRIVIAL_DRAFT_KEYS = new Set(["schema_version"]);

export function buildPriorContextBlock(
  draft: DigestSpecDraft | undefined,
  applied: AppliedSlots,
  proposed: AppliedSlots
): string {
  const draftFields = draft
    ? Object.entries(draft).filter(([k, v]) => {
        if (TRIVIAL_DRAFT_KEYS.has(k)) return false;
        if (v === undefined || v === null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === "object") return Object.keys(v as object).length > 0;
        return true;
      })
    : [];
  const hasAnything =
    draftFields.length > 0 || anyApplied(applied) || anyProposed(proposed);
  if (!hasAnything) return "";

  const lines: string[] = [
    "## PRIOR CONTEXT (Wave 3 extractor — auto-generated)",
  ];

  if (draftFields.length > 0) {
    const snapshot = Object.fromEntries(draftFields);
    lines.push(
      "",
      "**Current draft already captures these fields. DO NOT re-ask the user for them; reference them naturally when relevant:**",
      "```json",
      JSON.stringify(snapshot, null, 2),
      "```"
    );
  }

  if (anyApplied(applied)) {
    lines.push(
      "",
      '**Just applied from the user\'s latest message (HIGH confidence). Open your next turn with a brief confirm + a `suggest_quick_replies` chip strip of ["Yes, that\'s right", "Change something"]. Example phrasing: "Sounds like a daily crypto brief — want to start there?" — then move on to the next missing slot.**',
      "```json",
      JSON.stringify(applied, null, 2),
      "```"
    );
  }

  if (anyProposed(proposed)) {
    lines.push(
      "",
      "**These were inferred at MEDIUM confidence — NOT applied to the draft yet. Confirm or ask before treating them as truth. Use `suggest_quick_replies` to give the user 2-3 quick reply chips that match the candidates.**",
      "```json",
      JSON.stringify(proposed, null, 2),
      "```"
    );
  }

  return lines.join("\n");
}
