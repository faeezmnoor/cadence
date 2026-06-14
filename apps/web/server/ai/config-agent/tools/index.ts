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
export { send_sample } from "./send_sample";
export { save_changes } from "./save_changes";

import { propose_spec } from "./propose_spec";
import { update_spec_field } from "./update_spec_field";
import { ask_user } from "./ask_user";
import { add_rss_feed } from "./add_rss_feed";
import { confirm_and_save } from "./confirm_and_save";
import { suggest_quick_replies } from "./suggest_quick_replies";
import { send_sample } from "./send_sample";
import { save_changes } from "./save_changes";

/**
 * Canonical ordering — matches the system prompt's enumeration.
 *
 * BYTE-FROZEN for the setup eval gate: test/config-agent.eval.test.ts
 * asserts these exact 6 keys. Manage mode adds a SECOND registry below —
 * never extend this one.
 */
export const configAgentTools = {
  propose_spec,
  update_spec_field,
  ask_user,
  add_rss_feed,
  confirm_and_save,
  suggest_quick_replies,
} as const;

export type ConfigAgentToolName = keyof typeof configAgentTools;

/**
 * Manage-mode registry (plan §4.3.2) — matches the manage prompt's
 * enumeration. Deliberately NO `confirm_and_save` (manage saves go through
 * the cap-free in-place updater) and NO `add_rss_feed` (RSS edits are out
 * of scope this wave; the prompt's scope fence owns the ask honestly per
 * exec RC3). Guarded by its own exact-keys eval assertion, mirroring setup.
 */
export const manageAgentTools = {
  propose_spec, // reused: preview the edited draft
  update_spec_field, // reused: stage edits onto session.draft
  ask_user,
  suggest_quick_replies,
  send_sample, // NEW: dry-run preview / real Telegram send
  save_changes, // NEW: in-place update, no cap interaction
} as const;

export type ManageAgentToolName = keyof typeof manageAgentTools;
