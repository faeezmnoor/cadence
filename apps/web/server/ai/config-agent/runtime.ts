/**
 * Bridges the descriptor tools (T-105) into the Vercel AI SDK `tool()` shape
 * expected by `streamText`. Lives separate from the descriptors themselves
 * so the descriptor module stays free of @ai-sdk/* imports (testable in
 * isolation).
 *
 * Each AI SDK tool's `execute` runs server-side during the streaming loop
 * and is wired to the descriptor's handler, with a shared ConfigAgentContext
 * captured by closure. Side effects (e.g. saveSpec) reach the descriptor
 * via that context.
 */
import { tool } from "ai";
import { configAgentTools } from "./tools";
import { safeExecute } from "./safe-execute";
import type { ConfigAgentContext } from "./types";

/**
 * Build AI SDK tools.
 *
 * Every execute is wrapped in `safeExecute` (T-409 / CAD-71) so a tool
 * handler throw becomes a `{ok:false, error, recoverable:true}` tool result
 * instead of an unhandled stream exception that kills the chat. The LLM
 * receives the error and can recover (e.g. by asking the user for the
 * missing field), and the chat session stays alive.
 */
export function buildAiSdkTools(ctx: ConfigAgentContext) {
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
  };
}
