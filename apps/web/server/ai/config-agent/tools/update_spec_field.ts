/**
 * Tool: update_spec_field
 *
 * Patch one field on the working draft using dot-notation. Used for
 * incremental tweaks once a draft has been proposed.
 *
 * Examples:
 *   - path: "cadence.delivery_time_local"   value: "07:30"
 *   - path: "entities.tickers"              value: ["SDP.KL", "IOIB.KL"]
 *   - path: "data_addons.show_prices"       value: true
 *
 * Re-validates the entire draft via digestSpecDraftSchema after the edit
 * so the LLM can't drift the shape.
 */
import { z } from "zod";
import { emptyDraft, setByPath, UPDATABLE_TOP_LEVEL_KEYS } from "../draft";
import type { ToolDescriptor } from "../types";

const updateSpecFieldSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(120)
    .describe(
      `Dot-notation path. Top-level key must be one of: ${UPDATABLE_TOP_LEVEL_KEYS.join(
        ", "
      )}.`
    ),
  // We can't strongly type `value` against the path at the schema level —
  // it's whatever JSON the LLM emits. The draft re-validation catches bad
  // shapes downstream.
  value: z
    .unknown()
    .describe(
      "New value for the field. Must match the DigestSpec schema for that path (e.g. cadence.delivery_time_local must be 'HH:MM')."
    ),
});

export const update_spec_field: ToolDescriptor<typeof updateSpecFieldSchema> = {
  name: "update_spec_field",
  description:
    "Patch a single field on the working draft using a dot-notation path. Use for small tweaks during back-and-forth (e.g. changing delivery time after the user previews).",
  schema: updateSpecFieldSchema,
  handler: async (input, ctx) => {
    const current = ctx.session.draft ?? emptyDraft();
    const next = setByPath(current, input.path, input.value);
    ctx.session.draft = next;
    return {
      ok: true as const,
      path: input.path,
      draft: next,
    };
  },
};
