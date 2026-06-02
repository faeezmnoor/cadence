"use client";

import type { Message } from "ai";

/**
 * One chat bubble. Surfaces:
 *  - user text on the right
 *  - assistant text + ask_user question on the left
 *  - propose_spec / confirm_and_save tool results as a soft "spec preview"
 *    notice (no heavy card yet — that lands in T-109 /spec view)
 *
 * Tool results are read from message.toolInvocations (AI SDK shape).
 */
export function MessageBubble({
  message,
  onSuggestionClick,
  suggestionsDisabled,
}: {
  message: Message;
  onSuggestionClick?: (text: string) => void;
  suggestionsDisabled?: boolean;
}) {
  const isUser = message.role === "user";

  // Pluck structured tool outputs for richer rendering.
  const askQuestion = message.toolInvocations?.find(
    (t) => t.toolName === "ask_user" && t.state === "result"
  );
  const proposedSpec = message.toolInvocations?.find(
    (t) => t.toolName === "propose_spec" && t.state === "result"
  );
  const savedSpec = message.toolInvocations?.find(
    (t) => t.toolName === "confirm_and_save" && t.state === "result"
  );

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2 text-sm text-background">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm">
        {message.content && (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}

        {askQuestion?.state === "result" && (
          <ToolAskUser
            invocation={askQuestion}
            onSuggestionClick={onSuggestionClick}
            suggestionsDisabled={suggestionsDisabled}
          />
        )}
      </div>

      {proposedSpec?.state === "result" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Spec drafted — review and reply to confirm or tweak.
        </div>
      )}
      {savedSpec?.state === "result" && (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-600 dark:text-green-400">
          Spec saved. Opening your spec view…
        </div>
      )}
    </div>
  );
}

/**
 * Lightweight ask_user rendering — pulls the `question` field out of the
 * tool result and renders suggestion chips. We render the question as the
 * primary assistant message text rather than duplicating it.
 */
function ToolAskUser({
  invocation,
  onSuggestionClick,
  suggestionsDisabled,
}: {
  invocation: NonNullable<Message["toolInvocations"]>[number] & {
    state: "result";
  };
  onSuggestionClick?: (text: string) => void;
  suggestionsDisabled?: boolean;
}) {
  const result = invocation.result as
    | { question?: string; suggestions?: string[] }
    | undefined;
  const suggestions = result?.suggestions ?? [];
  const question = result?.question;
  if (!question && suggestions.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {question && !invocation.toolName.includes("hidden") && (
        <p className="text-sm">{question}</p>
      )}
      {suggestions.length > 0 && (
        // T-410 / CAD-72: real <button>s, not spans. Tap-to-fill on mobile,
        // a11y-correct (keyboard activation, role=button by default), and
        // dispatches the suggestion as a user message via the parent handler.
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={suggestionsDisabled || !onSuggestionClick}
              onClick={() => onSuggestionClick?.(s)}
              className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
