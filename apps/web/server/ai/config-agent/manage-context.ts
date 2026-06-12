/**
 * Manage-mode per-turn context overlay + draft seeding (plan §4.3.4).
 *
 * `buildManageContextBlock` is the LOAD-BEARING state for manage turns
 * (AC7.3): the transcript is capped server-side (capManageTranscript, exec
 * RC7), and reactivated legacy threads may have arbitrary history — but the
 * agent always knows the brief because this block rides with the system
 * prompt on EVERY turn, outside `body.messages`. Same overlay pattern as
 * buildPriorContextBlock / buildTemplateSeedBlock.
 *
 * `specToDraft` seeds the working draft from the SAVED spec when the thread
 * has no staged edits (thread.draftSpec is null) so update_spec_field
 * patches layer onto reality, not onto an empty draft.
 *
 * Pure functions — no side effects, unit-tested without a DB.
 */
import {
  digestSpecDraftSchema,
  type DigestSpecDraft,
} from "@/lib/digest-spec/schema";
import { emptyDraft } from "./draft";

export interface ManageContextInput {
  /** digest_specs.name (user-facing label). */
  name: string;
  /** digest_specs.version (integer increment). */
  version: number;
  /** digest_specs.status — 'active' | 'paused' here (archived 409s upstream). */
  status: string;
  /** digest_specs.spec jsonb — the saved DigestSpec. */
  spec: unknown;
}

export function buildManageContextBlock(input: ManageContextInput): string {
  return [
    "## CURRENT BRIEF (server-injected, authoritative — refreshed every turn)",
    "",
    `You are managing the user's saved brief "${input.name}" (status: ${input.status}, internal version ${input.version}). This JSON is its CURRENT saved state — answer any "what does this brief watch / when does it arrive" question from it, in plain words (never echo the JSON, field names, or the words digest/spec/config):`,
    "```json",
    JSON.stringify(input.spec, null, 2),
    "```",
    "",
    "Edits are staged on a draft; NOTHING about this brief changes until `save_changes` runs after the user's explicit confirmation. Previews via `send_sample` show the saved state above, not unsaved staged edits.",
  ].join("\n");
}

/**
 * Saved spec → working draft. Defensive: a malformed jsonb row degrades to
 * an empty draft (same posture as the route's draftSpec hydration) rather
 * than poisoning the agent.
 */
export function specToDraft(spec: unknown): DigestSpecDraft {
  const parsed = digestSpecDraftSchema.safeParse(spec);
  return parsed.success ? parsed.data : emptyDraft();
}
