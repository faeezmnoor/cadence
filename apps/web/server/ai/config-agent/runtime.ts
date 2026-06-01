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
import type { ConfigAgentContext } from "./types";

export function buildAiSdkTools(ctx: ConfigAgentContext) {
  // The AI SDK `tool()` helper expects {description, parameters, execute}.
  // We map each descriptor onto that shape.
  return {
    propose_spec: tool({
      description: configAgentTools.propose_spec.description,
      parameters: configAgentTools.propose_spec.schema,
      execute: (input) => configAgentTools.propose_spec.handler(input, ctx),
    }),
    update_spec_field: tool({
      description: configAgentTools.update_spec_field.description,
      parameters: configAgentTools.update_spec_field.schema,
      execute: (input) =>
        configAgentTools.update_spec_field.handler(input, ctx),
    }),
    ask_user: tool({
      description: configAgentTools.ask_user.description,
      parameters: configAgentTools.ask_user.schema,
      execute: (input) => configAgentTools.ask_user.handler(input, ctx),
    }),
    add_rss_feed: tool({
      description: configAgentTools.add_rss_feed.description,
      parameters: configAgentTools.add_rss_feed.schema,
      execute: (input) => configAgentTools.add_rss_feed.handler(input, ctx),
    }),
    confirm_and_save: tool({
      description: configAgentTools.confirm_and_save.description,
      parameters: configAgentTools.confirm_and_save.schema,
      execute: (input) =>
        configAgentTools.confirm_and_save.handler(input, ctx),
    }),
  };
}
