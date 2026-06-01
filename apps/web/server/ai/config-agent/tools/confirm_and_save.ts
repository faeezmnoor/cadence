/**
 * Tool: confirm_and_save
 *
 * Final step. Validates the working draft against the strict
 * `digestSpecSchema` and writes a new `digest_specs` row via the injected
 * `saveSpec` side-effect (so this module stays unit-testable without DB).
 *
 * Rules (enforced by the system prompt; also defended here):
 *   - Must be called AFTER the user explicitly approves the previewed spec.
 *     The agent passes `user_confirmed: true` from prose; we don't trust
 *     the LLM blindly, but we surface a clear error if it skips.
 *   - Draft must be complete (all required fields present).
 *
 * On success: stores the new spec id on session.savedSpecId so the chat
 * UI can navigate to /spec.
 */
import { z } from "zod";
import { finalizeDraft } from "../draft";
import type { ToolDescriptor } from "../types";

const confirmAndSaveSchema = z.object({
  user_confirmed: z
    .boolean()
    .describe(
      "Must be true. Set this only after the user has explicitly approved the previewed spec."
    ),
});

export const confirm_and_save: ToolDescriptor<typeof confirmAndSaveSchema> = {
  name: "confirm_and_save",
  description:
    "Persist the current draft as a new DigestSpec version. Final action. Only call after the user has explicitly approved a previewed spec.",
  schema: confirmAndSaveSchema,
  handler: async (input, ctx) => {
    if (!input.user_confirmed) {
      throw new Error(
        "user_confirmed must be true; the user has not explicitly approved the spec yet"
      );
    }
    if (!ctx.session.draft) {
      throw new Error(
        "no draft to save — call propose_spec first and get user approval"
      );
    }
    const finalSpec = finalizeDraft(ctx.session.draft);
    const saved = await ctx.saveSpec({
      userId: ctx.session.userId,
      spec: finalSpec,
    });
    ctx.session.savedSpecId = saved.id;
    return {
      ok: true as const,
      spec_id: saved.id,
      version: saved.version,
    };
  },
};
