/**
 * Tool: suggest_quick_replies
 *
 * T-414 / CAD-74. Contextual quick-reply chips, surfaced to the UI as a
 * tool result the client renders below the latest assistant message.
 *
 * The agent should call this whenever it just asked the user a question
 * and there are 2-4 short, useful canned answers it can derive from the
 * current draft state. Examples:
 *
 *   - cadence empty -> ["every day", "weekdays", "Mon Wed Fri"]
 *   - language empty -> ["English", "Bahasa Malaysia", "中文"]
 *   - delivery time empty -> ["07:00", "08:00", "18:00"]
 *
 * Why a separate tool (vs ask_user.suggestions)? Decouples the chip
 * shelf from the question-asking turn — the agent can refresh chips on
 * any turn (e.g. after update_spec_field) without re-asking, and the UI
 * gets a stable, dedicated shape to render.
 *
 * Hard caps: max 4 chips, each <=20 chars. Anything longer fights the
 * mobile chip strip and stops looking like an "easy answer".
 */
import { z } from "zod";
import type { ToolDescriptor } from "../types";

const suggestQuickRepliesSchema = z.object({
  chips: z
    .array(z.string().min(1).max(20))
    .min(1)
    .max(4)
    .describe(
      "2-4 short tap-to-reply suggestions, each <=20 chars. Derive from the current draft (what's missing or likely next)."
    ),
});

export const suggest_quick_replies: ToolDescriptor<
  typeof suggestQuickRepliesSchema
> = {
  name: "suggest_quick_replies",
  description:
    "Offer 2-4 short tap-to-reply chips below your message. Use whenever there are obvious canned answers (cadence, language, delivery time, common topics). Max 4 chips, each <=20 chars.",
  schema: suggestQuickRepliesSchema,
  handler: async (input) => {
    return {
      ok: true as const,
      chips: input.chips,
    };
  },
};
