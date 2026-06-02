"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Message } from "ai";
import type { PersistedMessage } from "./types";
import { MessageBubble } from "./message-bubble";

/**
 * Streaming chat client for the config agent.
 *
 * - `useChat` posts to /api/chat with {threadId, messages}.
 * - `initialMessages` comes from the server hydration so reload works (T-108).
 * - On detecting the agent saved a spec (via tool results), we route to /spec.
 *
 * Why we map PersistedMessage → AI SDK Message manually:
 *   the AI SDK Message shape is {role, content (string), parts?, toolInvocations?}.
 *   Our persisted assistant turns are richer (separate text + tool calls);
 *   we collapse them into the format `useChat` expects on rehydration.
 */
export function ChatClient({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: PersistedMessage[];
}) {
  const router = useRouter();
  const hydrated: Message[] = initialMessages
    .map((m): Message | null => {
      if (m.content.kind === "user_text") {
        return {
          id: m.id,
          role: "user",
          content: m.content.text,
        };
      }
      if (m.content.kind === "assistant_turn") {
        // Synthesize a content string from text + ask_user question, if any.
        const askResult = m.content.toolResults?.find(
          (r) => r.toolName === "ask_user"
        )?.result as { question?: string } | undefined;
        const text =
          m.content.text?.trim() ||
          askResult?.question ||
          "(tool turn)";
        return {
          id: m.id,
          role: "assistant",
          content: text,
        };
      }
      return null;
    })
    .filter((m): m is Message => m !== null);

  const { messages, input, handleInputChange, handleSubmit, status, error, append } =
    useChat({
      api: "/api/chat",
      id: threadId,
      initialMessages: hydrated,
      body: { threadId },
    });

  const isStreamingState = status === "submitted" || status === "streaming";

  // T-410 / CAD-72: suggestion chips dispatch a user message on tap.
  // Disabled while streaming so we don't pile turns on top of an in-flight one.
  const handleSuggestion = (text: string) => {
    if (isStreamingState || !text.trim()) return;
    void append({ role: "user", content: text });
  };

  // Auto-scroll on new messages.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // If the last assistant turn includes a confirm_and_save tool result,
  // route to /spec — the chat is done.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const saved = last.toolInvocations?.some(
      (t) => t.toolName === "confirm_and_save" && t.state === "result"
    );
    if (saved) {
      router.push("/spec" as never);
    }
  }, [messages, router]);

  const isStreaming = isStreamingState;

  return (
    <main className="flex h-[100dvh] flex-col bg-background">
      <header className="border-b border-border px-4 py-3 sm:px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Cadence
        </p>
        <h1 className="text-lg font-semibold tracking-tight">
          Configure your brief
        </h1>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
              Tell me what you want to be briefed on — industry, companies,
              or commodities. I&apos;ll draft a spec in a few messages.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onSuggestionClick={handleSuggestion}
              suggestionsDisabled={isStreaming}
            />
          ))}
          {isStreaming && (
            <div className="text-xs text-muted-foreground">Thinking…</div>
          )}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error.message}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-background px-4 py-3 sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-2xl gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            disabled={isStreaming}
            placeholder="Type your reply…"
            autoFocus
            className="block h-11 flex-1 rounded-md border border-input bg-background px-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </main>
  );
}
