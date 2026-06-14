/**
 * Tool: save_changes (manage mode only — plan §4.3.3, locked decision 2)
 *
 * Apply the staged draft to the EXISTING brief, in place: same digest_specs
 * id forever, version + 1. Mirrors `confirm_and_save`'s defended gate
 * (`user_confirmed` must be true; a draft must exist), validates via
 * `finalizeDraft`, then writes through the injected `ctx.updateSpec`
 * (production: updateSpecInPlace — which never imports cap code; eval
 * harness: in-memory stub).
 *
 * NOT `confirm_and_save`: no new row, no is_current handover, no CAD-212
 * brief-count gate, no archive-and-replace. An edit of brief N is never a
 * brief N+1. (B2-hard note: both savers remain the agent-mediated-save
 * class; future deterministic-save hardening covers both choke points.)
 *
 * On success: stores the spec id on session.savedSpecId (the existing
 * persistence path stamps content.savedSpecId on the assistant turn,
 * keeping the migration-0029 backfill invariant true going forward) and
 * clears the session draft — the rail's pending markers reset to the new
 * saved baseline.
 */
import { z } from "zod";
import { finalizeDraft } from "../draft";
import type { ToolDescriptor } from "../types";

const saveChangesSchema = z.object({
  user_confirmed: z
    .boolean()
    .describe(
      "Must be true. Set this only after the user has explicitly confirmed the previewed changes (the 'Looks good — update this brief' button or a typed yes)."
    ),
});

export const save_changes: ToolDescriptor<typeof saveChangesSchema> = {
  name: "save_changes",
  description:
    "Apply the staged changes to this brief, in place. Final action. Only call after the user has explicitly confirmed the previewed changes — exactly once per confirmation.",
  schema: saveChangesSchema,
  handler: async (input, ctx) => {
    if (!input.user_confirmed) {
      throw new Error(
        "user_confirmed must be true; the user has not explicitly confirmed the changes yet"
      );
    }
    if (!ctx.session.draft) {
      throw new Error(
        "no staged changes to apply — stage an edit and get the user's confirmation first"
      );
    }
    if (!ctx.updateSpec) {
      throw new Error("updating is not available in this conversation");
    }
    const specId = ctx.session.boundSpecId;
    if (!specId) {
      throw new Error("this conversation is not linked to a saved brief");
    }

    const finalSpec = finalizeDraft(ctx.session.draft);
    const updated = await ctx.updateSpec({
      userId: ctx.session.userId,
      specId,
      spec: finalSpec,
    });

    ctx.session.savedSpecId = updated.id;
    ctx.session.draft = undefined;

    // Same result shape as confirm_and_save (spec_id + version) so the
    // client's savedSpecId scan recognizes both (plan §4.6) — on a bound
    // thread it always equals initialSavedSpecId by construction.
    return {
      ok: true as const,
      spec_id: updated.id,
      version: updated.version,
    };
  },
};
