/**
 * Barrel export + ordered tool registry for the config agent.
 *
 * The chat route (T-103) converts these descriptors into Vercel AI SDK
 * tool definitions. The eval harness (T-111) drives them directly.
 */
export { propose_spec } from "./propose_spec";
export { update_spec_field } from "./update_spec_field";
export { ask_user } from "./ask_user";
export { add_rss_feed } from "./add_rss_feed";
export { confirm_and_save } from "./confirm_and_save";
export { suggest_quick_replies } from "./suggest_quick_replies";

import { propose_spec } from "./propose_spec";
import { update_spec_field } from "./update_spec_field";
import { ask_user } from "./ask_user";
import { add_rss_feed } from "./add_rss_feed";
import { confirm_and_save } from "./confirm_and_save";
import { suggest_quick_replies } from "./suggest_quick_replies";

/** Canonical ordering — matches the system prompt's enumeration. */
export const configAgentTools = {
  propose_spec,
  update_spec_field,
  ask_user,
  add_rss_feed,
  confirm_and_save,
  suggest_quick_replies,
} as const;

export type ConfigAgentToolName = keyof typeof configAgentTools;
