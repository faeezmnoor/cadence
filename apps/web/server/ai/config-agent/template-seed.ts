/**
 * TEMPLATE SEED system-prompt addendum builder (brief-creation revamp PR 2,
 * proposals/brief-creation-flow-proposal.md §6 "Seeding").
 *
 * When a thread started from a catalog card (chat_threads.template_id,
 * migration 0026), the agent gets a per-turn overlay describing what the
 * card already promised — topic, cadence, likely entities — plus the
 * interview contract:
 *
 *   confirm the two slots the card set → ask exactly ONE forking question
 *   → saved brief within 3 questions total.
 *
 * Hard rules encoded here:
 *  - The agent CONFIRMS seed hints with the user; it never writes them to
 *    the spec unasked ("Confirm, don't assume" — a card tap is informed
 *    consent to the topic, not to every detail).
 *  - The overlay only fires on the first exchanges (turnIdx ≤ MAX_SEED_TURN);
 *    after that the draft + prior-context block carry the state and the
 *    seed would just be prompt noise.
 *  - The base prompt stays canonical on disk — this is a per-turn overlay,
 *    same pattern as buildPriorContextBlock (CAD-182).
 *
 * Pure function — no side effects, easy to unit-test. The live interview
 * eval that asserts the contract end-to-end is test/eval-template-live.test.ts
 * (env-gated; LLM calls are banned from CI).
 */
import { DIGEST_TEMPLATES } from "@/lib/digest-spec/templates";

/**
 * The reply contract the post-tap eval asserts against. Exported so the
 * eval and this prompt can never drift apart.
 */
export const TEMPLATE_REPLY_CONTRACT = [
  "1. Open with a short confirmation of the two slots the card already set (topic + schedule). Shape: \"On it — palm oil, every weekday morning.\"",
  "2. Then ask exactly ONE question — the forking question below. No other questions in this reply.",
  "3. Never re-ask the topic or the schedule unless the user changes them.",
  "4. Target: the brief should be confirmed and saved within 3 questions total. Prefer sensible defaults over extra questions.",
].join("\n");

/**
 * chat_messages rows counted AFTER the current user message is persisted:
 * turn 1 = first user message, 3 = second user message. Seed through the
 * second exchange, then stop.
 */
export const MAX_SEED_TURN = 3;

export function buildTemplateSeedBlock(args: {
  templateId: string | null | undefined;
  /** Persisted message count for the thread, including the current user message. */
  turnIdx: number;
}): string {
  if (!args.templateId) return "";
  if (args.turnIdx > MAX_SEED_TURN) return "";
  const tpl = DIGEST_TEMPLATES.find((t) => t.id === args.templateId);
  if (!tpl) return "";

  const lines: string[] = [
    "## TEMPLATE SEED (card tap — auto-generated)",
    "",
    `The user started by tapping the "${tpl.label}" card (${tpl.id}); their first message was auto-submitted by that card, not typed.`,
  ];

  if (tpl.seedHints && Object.keys(tpl.seedHints).length > 0) {
    lines.push(
      "",
      "**Likely setup from the card. CONFIRM with the user before relying on details — do NOT write these to the spec until the user has confirmed or refined them:**",
      "```json",
      JSON.stringify(tpl.seedHints, null, 2),
      "```"
    );
  }

  lines.push("", "**Contract for your next reply:**", TEMPLATE_REPLY_CONTRACT);

  if (tpl.forkingQuestion) {
    lines.push("", `**The forking question:** "${tpl.forkingQuestion}"`);
  }

  return lines.join("\n");
}
