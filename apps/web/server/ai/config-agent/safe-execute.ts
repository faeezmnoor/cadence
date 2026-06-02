/**
 * safe-execute — wraps a config-agent tool handler so a thrown error becomes
 * a tool RESULT the LLM can see and self-correct on, instead of bubbling out
 * as a streamText exception that kills the chat session.
 *
 * Why this exists (T-409 / CAD-71):
 *   Before this wrapper, any `throw new Error(...)` inside a tool handler
 *   (e.g. "draft is incomplete; cannot save: topics ...") surfaced to the
 *   client as a red banner and a dead conversation. The LLM had no chance
 *   to read the error and retry — the stream had already aborted.
 *
 *   With this wrapper, the same throw resolves to:
 *     { ok: false, error: "...", recoverable: true }
 *   which the model receives as a normal tool result and can react to
 *   (e.g. by calling ask_user to gather the missing field).
 *
 * Non-goal: we do NOT swallow programmer bugs silently. The error message
 * is preserved verbatim, and we re-log on the server so Sentry/console
 * still see what happened.
 */
import { log } from "@/lib/log";

export type ToolErrorEnvelope = {
  ok: false;
  error: string;
  recoverable: true;
};

export function isToolErrorEnvelope(v: unknown): v is ToolErrorEnvelope {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { ok?: unknown }).ok === false &&
    typeof (v as { error?: unknown }).error === "string"
  );
}

/**
 * Wrap an async tool execute function. On throw, returns a recoverable
 * error envelope. On success, returns the underlying result unchanged.
 */
export function safeExecute<TArgs, TResult>(
  toolName: string,
  fn: (args: TArgs) => Promise<TResult>
): (args: TArgs) => Promise<TResult | ToolErrorEnvelope> {
  return async (args: TArgs) => {
    try {
      return await fn(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("config-agent tool recoverable failure", {
        tool: toolName,
        err: message,
      });
      return {
        ok: false,
        error: message,
        recoverable: true,
      } satisfies ToolErrorEnvelope;
    }
  };
}
