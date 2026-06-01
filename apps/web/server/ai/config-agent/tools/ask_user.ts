/**
 * Tool: ask_user
 *
 * The agent's primary way to address the user. UI renders the question
 * verbatim as the assistant's chat bubble. By forcing questions through a
 * tool call rather than free-form prose we get:
 *
 *  1. Every assistant turn is a structured tool invocation (matches the
 *     "always call a tool" rule in the system prompt).
 *  2. The UI can render question affordances differently from tool results
 *     (e.g. focus the input, optionally render suggestion chips).
 *  3. The eval harness (T-111) can detect "agent is waiting on the user"
 *     deterministically.
 *
 * Optional `suggestions` are short tap-to-fill chips the UI may render.
 */
import { z } from "zod";
import type { ToolDescriptor } from "../types";

const askUserSchema = z.object({
  question: z
    .string()
    .min(1)
    .max(500)
    .describe("One focused question for the user. Avoid stacking multiple."),
  suggestions: z
    .array(z.string().min(1).max(60))
    .max(6)
    .optional()
    .describe(
      "Optional short suggestion chips the UI may render below the question."
    ),
});

export const ask_user: ToolDescriptor<typeof askUserSchema> = {
  name: "ask_user",
  description:
    "Ask the user one focused question. The UI renders this as your message. Prefer this over open-ended prose. Do not stack multiple questions.",
  schema: askUserSchema,
  handler: async (input) => {
    // Pure pass-through. The chat route surfaces this to the client as
    // an assistant message. No session mutation.
    return {
      ok: true as const,
      question: input.question,
      suggestions: input.suggestions ?? [],
    };
  },
};
