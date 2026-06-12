/**
 * Tool: send_sample (manage mode only — plan §4.3.3, locked decision 4)
 *
 * Compose a sample of the thread's BOUND brief now, via the shared sample
 * core (server/digest/sample.ts) reached through the injected
 * `ctx.sendSample` (kept injected like saveSpec so the eval harness stubs
 * it without a DB; the route wires it to
 * runSampleForUser({origin:'chat_tool', specId: boundSpecId})).
 *
 *   deliver: false → dry-run; markdown preview renders inline as a tool-part
 *                    card (SamplePreviewCard keys on `result.markdown`).
 *                    Zero-credit + rowless by design, bounded by the 60s
 *                    chat-origin dry-run throttle (exec RC6).
 *   deliver: true  → real Telegram send; 5-min per-user delivery cooldown.
 *
 * Failures are TYPED RETURNS, never throws (AC2.2): the model phrases them
 * per the manage prompt — cooldowns get a wait + preview offer (and never
 * blame "this brief"; the window is per-user across ALL briefs), no_credits
 * gets the persona-free top-up line, etc. The `run` internals from the
 * pipeline are stripped — the model only ever sees the typed shape.
 */
import { z } from "zod";
import { log } from "@/lib/log";
import { sampleBlockedReason } from "@/server/digest/sample";
import type { ToolDescriptor } from "../types";

const sendSampleSchema = z.object({
  deliver: z
    .boolean()
    .describe(
      "false = preview the sample here in the chat (dry run). true = send a real sample to the user's Telegram."
    ),
});

export type SendSampleToolResult =
  | { ok: true; deliver: false; markdown: string | null }
  | { ok: true; deliver: true; delivered: true }
  | {
      ok: false;
      code: "cooldown";
      scope: "delivery" | "dry_run";
      retryAfterMs: number;
      retryAfterMinutes: number;
    }
  | {
      ok: false;
      code:
        | "no_telegram"
        | "no_credits"
        | "archived"
        | "spec_not_found"
        | "stale_spec"
        | "no_spec"
        | "duplicate"
        | "failed";
    };

export const send_sample: ToolDescriptor<typeof sendSampleSchema> = {
  name: "send_sample",
  description:
    "Compose a sample of this brief now. deliver:false renders a preview right here in the chat; deliver:true sends a real sample to the user's Telegram. Returns typed results — phrase failures conversationally, never show raw codes.",
  schema: sendSampleSchema,
  handler: async (input, ctx): Promise<SendSampleToolResult> => {
    if (!ctx.sendSample) {
      throw new Error("sampling is not available in this conversation");
    }
    const specId = ctx.session.boundSpecId;
    if (!specId) {
      throw new Error("this conversation is not linked to a saved brief");
    }

    const dryRun = !input.deliver;
    // ACX.5 analytics — same fields the panel path logs, via:'chat_tool'.
    log.info("sample_requested", {
      userId: ctx.session.userId,
      threadId: ctx.session.threadId,
      specId,
      via: "chat_tool",
      dry_run: dryRun,
    });

    const result = await ctx.sendSample({ dryRun, specId });

    if (!result.ok) {
      log.info("sample_blocked", {
        userId: ctx.session.userId,
        threadId: ctx.session.threadId,
        specId,
        via: "chat_tool",
        dry_run: dryRun,
        reason: sampleBlockedReason(
          result.code,
          "scope" in result ? result.scope : undefined
        ),
      });
      if (result.code === "cooldown") {
        return {
          ok: false,
          code: "cooldown",
          scope: result.scope,
          retryAfterMs: result.retryAfterMs,
          retryAfterMinutes: Math.max(
            1,
            Math.ceil(result.retryAfterMs / 60_000)
          ),
        };
      }
      // Typed pass-through, run internals stripped.
      return { ok: false, code: result.code };
    }

    return dryRun
      ? { ok: true, deliver: false, markdown: result.markdown }
      : { ok: true, deliver: true, delivered: true };
  },
};
