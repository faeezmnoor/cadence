/**
 * Bridges the descriptor tools (T-105) into the Vercel AI SDK `tool()` shape
 * expected by `streamText`. Lives separate from the descriptors themselves
 * so the descriptor module stays free of @ai-sdk/* imports (testable in
 * isolation).
 *
 * Each AI SDK tool's `execute` runs server-side during the streaming loop
 * and is wired to the descriptor's handler, with a shared ConfigAgentContext
 * captured by closure. Side effects (e.g. saveSpec / updateSpec /
 * sendSample) reach the descriptor via that context.
 */
import { tool, type ToolSet } from "ai";
import { configAgentTools, manageAgentTools } from "./tools";
import { safeExecute } from "./safe-execute";
import type { ConfigAgentContext } from "./types";

/** Manage-mode plan §4.2: derived from chat_threads.spec_id, never stored. */
export type AgentMode = "setup" | "manage";

function buildSetupTools(ctx: ConfigAgentContext) {
  return {
    propose_spec: tool({
      description: configAgentTools.propose_spec.description,
      parameters: configAgentTools.propose_spec.schema,
      execute: safeExecute("propose_spec", (input) =>
        configAgentTools.propose_spec.handler(input, ctx)
      ),
    }),
    update_spec_field: tool({
      description: configAgentTools.update_spec_field.description,
      parameters: configAgentTools.update_spec_field.schema,
      execute: safeExecute("update_spec_field", (input) =>
        configAgentTools.update_spec_field.handler(input, ctx)
      ),
    }),
    ask_user: tool({
      description: configAgentTools.ask_user.description,
      parameters: configAgentTools.ask_user.schema,
      execute: safeExecute("ask_user", (input) =>
        configAgentTools.ask_user.handler(input, ctx)
      ),
    }),
    add_rss_feed: tool({
      description: configAgentTools.add_rss_feed.description,
      parameters: configAgentTools.add_rss_feed.schema,
      execute: safeExecute("add_rss_feed", (input) =>
        configAgentTools.add_rss_feed.handler(input, ctx)
      ),
    }),
    confirm_and_save: tool({
      description: configAgentTools.confirm_and_save.description,
      parameters: configAgentTools.confirm_and_save.schema,
      execute: safeExecute("confirm_and_save", (input) =>
        configAgentTools.confirm_and_save.handler(input, ctx)
      ),
    }),
    suggest_quick_replies: tool({
      description: configAgentTools.suggest_quick_replies.description,
      parameters: configAgentTools.suggest_quick_replies.schema,
      execute: safeExecute("suggest_quick_replies", (input) =>
        configAgentTools.suggest_quick_replies.handler(input, ctx)
      ),
    }),
  };
}

function buildManageTools(ctx: ConfigAgentContext) {
  return {
    propose_spec: tool({
      description: manageAgentTools.propose_spec.description,
      parameters: manageAgentTools.propose_spec.schema,
      execute: safeExecute("propose_spec", (input) =>
        manageAgentTools.propose_spec.handler(input, ctx)
      ),
    }),
    update_spec_field: tool({
      description: manageAgentTools.update_spec_field.description,
      parameters: manageAgentTools.update_spec_field.schema,
      execute: safeExecute("update_spec_field", (input) =>
        manageAgentTools.update_spec_field.handler(input, ctx)
      ),
    }),
    ask_user: tool({
      description: manageAgentTools.ask_user.description,
      parameters: manageAgentTools.ask_user.schema,
      execute: safeExecute("ask_user", (input) =>
        manageAgentTools.ask_user.handler(input, ctx)
      ),
    }),
    suggest_quick_replies: tool({
      description: manageAgentTools.suggest_quick_replies.description,
      parameters: manageAgentTools.suggest_quick_replies.schema,
      execute: safeExecute("suggest_quick_replies", (input) =>
        manageAgentTools.suggest_quick_replies.handler(input, ctx)
      ),
    }),
    send_sample: tool({
      description: manageAgentTools.send_sample.description,
      parameters: manageAgentTools.send_sample.schema,
      execute: safeExecute("send_sample", (input) =>
        manageAgentTools.send_sample.handler(input, ctx)
      ),
    }),
    save_changes: tool({
      description: manageAgentTools.save_changes.description,
      parameters: manageAgentTools.save_changes.schema,
      execute: safeExecute("save_changes", (input) =>
        manageAgentTools.save_changes.handler(input, ctx)
      ),
    }),
  };
}

/**
 * Build AI SDK tools for the requested mode. Default is setup so the
 * pre-manage-mode call sites (route, live eval) stay byte-compatible and
 * keep their precise inferred tool shapes.
 *
 * Every execute is wrapped in `safeExecute` (T-409 / CAD-71) so a tool
 * handler throw becomes a `{ok:false, error, recoverable:true}` tool result
 * instead of an unhandled stream exception that kills the chat. The LLM
 * receives the error and can recover (e.g. by asking the user for the
 * missing field), and the chat session stays alive.
 */
export function buildAiSdkTools(
  ctx: ConfigAgentContext
): ReturnType<typeof buildSetupTools>;
export function buildAiSdkTools(
  ctx: ConfigAgentContext,
  mode: "setup"
): ReturnType<typeof buildSetupTools>;
export function buildAiSdkTools(
  ctx: ConfigAgentContext,
  mode: "manage"
): ReturnType<typeof buildManageTools>;
export function buildAiSdkTools(ctx: ConfigAgentContext, mode: AgentMode): ToolSet;
export function buildAiSdkTools(
  ctx: ConfigAgentContext,
  mode: AgentMode = "setup"
): ToolSet {
  return mode === "manage" ? buildManageTools(ctx) : buildSetupTools(ctx);
}
