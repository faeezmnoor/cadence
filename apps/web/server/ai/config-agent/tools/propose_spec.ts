/**
 * Tool: propose_spec
 *
 * The agent hands in a (partial or full) DigestSpec draft for the user to
 * preview before saving. We merge the proposal into the session draft so
 * subsequent `update_spec_field` calls layer on top, and return the
 * resulting draft so the UI can render a preview card.
 *
 * This tool does NOT persist anything — `confirm_and_save` is the only
 * write path.
 */
import { z } from "zod";
import { digestSpecDraftSchema } from "@/lib/digest-spec/schema";
import { emptyDraft, mergeProposal } from "../draft";
import type { ToolDescriptor } from "../types";

const proposeSpecSchema = z.object({
  spec: digestSpecDraftSchema.describe(
    "Partial or full DigestSpec draft. Same shape as DigestSpec but all fields optional."
  ),
});

export const propose_spec: ToolDescriptor<typeof proposeSpecSchema> = {
  name: "propose_spec",
  description:
    "Show the user a draft DigestSpec as a preview. Use this once you believe you have enough info to draft. Pass the full proposed spec; missing fields will use defaults at save time. Does not persist.",
  schema: proposeSpecSchema,
  handler: async (input, ctx) => {
    const current = ctx.session.draft ?? emptyDraft();
    const next = mergeProposal(current, input.spec);
    ctx.session.draft = next;
    return {
      ok: true as const,
      draft: next,
      preview_message:
        "Drafted spec; show this to the user and ask for explicit approval before calling confirm_and_save.",
    };
  },
};
