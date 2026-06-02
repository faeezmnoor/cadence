"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Message } from "ai";
import type { PersistedMessage } from "./types";
import { MessageBubble } from "./message-bubble";
import { SpecSidebar, type DraftLike } from "./spec-sidebar";
import { trpc } from "@/lib/trpc/client";

/**
 * Streaming chat client for the config agent.
 *
 * v2 (T-413/T-414/T-415) adds:
 *  - Reset button in the header (T-413): chat.resetThread clears history
 *    + draft, then we wipe local state and reload the page to rehydrate.
 *  - Quick-reply chips from a dedicated `suggest_quick_replies` tool
 *    (T-414): rendered below the latest assistant message; the existing
 *    ask_user suggestions continue to work too.
 *  - Spec sidebar (T-415): pulls the live draft via chat.getDraft and
 *    invalidates on every assistant turn finish.
 */
export function ChatClient({
  threadId,
  initialMessages,
  initialDraft,
}: {
  threadId: string;
  initialMessages: PersistedMessage[];
  initialDraft: DraftLike;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [resetting, setResetting] = useState(false);

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

  const draftQuery = trpc.chat.getDraft.useQuery(
    { threadId },
    {
      initialData: initialDraft,
      // The streaming endpoint writes the draft after each assistant turn;
      // we invalidate from the useChat onFinish below, so disable polling.
      refetchOnWindowFocus: false,
    }
  );
  const resetMut = trpc.chat.resetThread.useMutation();

  const { messages, input, handleInputChange, handleSubmit, status, error, append, setMessages } =
    useChat({
      api: "/api/chat",
      id: threadId,
      initialMessages: hydrated,
      body: { threadId },
      onFinish: () => {
        // Pull the fresh draft so the sidebar reacts to whatever
        // update_spec_field / propose_spec wrote during this turn.
        void utils.chat.getDraft.invalidate({ threadId });
      },
    });

  const isStreamingState = status === "submitted" || status === "streaming";

  // Stream E #7 (PM audit G4) — language honesty.
  // We only deliver briefs in English today. Until BM/中文 ship E2E, intercept
  // the language chips: instead of sending the chip as a user reply (which
  // would let the agent set language=ms / zh in the spec — a positioning
  // lie), capture interest and acknowledge.
  // See feedback_cadence_positioning.
  const registerLangInterest = trpc.interest.registerLanguage.useMutation();
  const [langAck, setLangAck] = useState<null | "ms" | "zh">(null);

  function classifyLanguageChip(text: string): null | "ms" | "zh" {
    const t = text.toLowerCase();
    if (t.includes("bahasa") || t.includes("malay")) return "ms";
    // Chinese chip — match the actual CJK or 'chinese' English label.
    if (/[一-鿿]/.test(text) || t.includes("chinese")) return "zh";
    return null;
  }

  // T-410 / CAD-72: suggestion chips dispatch a user message on tap.
  const handleSuggestion = (text: string) => {
    if (isStreamingState || !text.trim()) return;
    const lang = classifyLanguageChip(text);
    if (lang) {
      // Intercept — capture interest, do not send the chip to the agent.
      registerLangInterest.mutate(
        { languageCode: lang },
        {
          onSuccess: () => setLangAck(lang),
          onError: () => setLangAck(lang), // still ack; the row insert is best-effort
        }
      );
      return;
    }
    void append({ role: "user", content: text });
  };

  // T-414 / CAD-74: extract suggest_quick_replies chips from the latest
  // assistant message. We render these as a separate, dedicated chip strip
  // (in addition to any ask_user.suggestions the bubble may render).
  const latestQuickReplies = useMemo<string[]>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === "user") return []; // already answered
      if (m.role !== "assistant") continue;
      const tool = m.toolInvocations?.find(
        (t) => t.toolName === "suggest_quick_replies" && t.state === "result"
      );
      if (!tool || tool.state !== "result") return [];
      const r = tool.result as { chips?: string[] } | undefined;
      const chips = Array.isArray(r?.chips) ? r!.chips : [];
      return chips.filter((c): c is string => typeof c === "string").slice(0, 4);
    }
    return [];
  }, [messages]);

  // Auto-scroll on new messages.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Designer #2 fix: if the last assistant turn includes a confirm_and_save
  // tool result, route to /app/link (the Telegram connect step) instead of
  // /spec. Largest conversion leak in the product per design-audit-v1 §5 —
  // the user finishes the chat triumphant and needs the next action surfaced
  // before they see raw JSON. /spec remains reachable via the AppNav.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const saved = last.toolInvocations?.some(
      (t) => t.toolName === "confirm_and_save" && t.state === "result"
    );
    if (saved) {
      router.push("/app/link" as never);
    }
  }, [messages, router]);

  const handleReset = async () => {
    if (isStreamingState || resetting) return;
    const ok = window.confirm(
      "Reset this conversation? Captured details will be cleared. This cannot be undone."
    );
    if (!ok) return;
    setResetting(true);
    try {
      await resetMut.mutateAsync({ threadId });
      setMessages([]);
      await utils.chat.getDraft.invalidate({ threadId });
      // Hard reload so server-side hydration matches the new state and we
      // start from a guaranteed-clean useChat instance.
      router.refresh();
    } finally {
      setResetting(false);
    }
  };

  const isStreaming = isStreamingState;
  const draft = (draftQuery.data ?? null) as DraftLike;

  const hasMessages = messages.length > 0;

  // Designer #3 (audit §3): seed turn 0 with a welcome bubble + 3 starter
  // chips so the user sees concrete examples instead of a grey info card.
  // Chips reflect Cadence's channel-agnostic, industry-customizable framing
  // — NOT "telegram-y" copy. See feedback_cadence_positioning.
  // Clicking a chip auto-submits as the user's first message; once any
  // message exists the welcome state disappears (T-414 contextual chips
  // take over from there).
  const STARTER_CHIPS: readonly string[] = [
    "Palm oil daily",
    "S&P + my watchlist weekly",
    "KL F&B trends",
  ] as const;

  return (
    <main className="flex min-h-0 flex-1 bg-background">
      <div className="flex flex-1 flex-col min-h-0">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Configure your brief
          </h1>
          <button
            type="button"
            onClick={handleReset}
            disabled={isStreaming || resetting}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Reset conversation"
            title="Reset conversation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            {resetting ? "Resetting…" : "Reset"}
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {!hasMessages && (
              <div data-testid="chat-welcome" className="flex flex-col gap-3">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm text-foreground">
                  Hey 👋 I&apos;m Cadence. Tell me what industry to watch, in
                  your words. I&apos;ll handle the rest.
                </div>
                <div
                  data-testid="chat-starter-chips"
                  className="flex flex-wrap gap-1.5"
                  aria-label="Starter examples"
                >
                  {STARTER_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleSuggestion(c)}
                      disabled={isStreaming}
                      className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {c}
                    </button>
                  ))}
                </div>
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
            {!isStreaming && latestQuickReplies.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5"
                aria-label="Quick reply suggestions"
              >
                {latestQuickReplies.map((c, i) => {
                  // Stream E #7 — relabel BM/中文 chips as "coming July".
                  const lang = classifyLanguageChip(c);
                  const label = lang
                    ? `${c} · coming July — notify me`
                    : c;
                  return (
                    <button
                      key={`${c}-${i}`}
                      type="button"
                      onClick={() => handleSuggestion(c)}
                      data-language-interest={lang ?? undefined}
                      className={
                        lang
                          ? "inline-flex items-center rounded-full border border-dashed border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          : "inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            {langAck && (
              <div
                data-testid="language-interest-ack"
                role="status"
                className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
              >
                Got it — I&rsquo;ll email you the moment{" "}
                {langAck === "ms" ? "Bahasa Malaysia" : "中文"} briefs ship
                (targeting July). For now, please continue in English.
              </div>
            )}
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

        {/* Mobile spec disclosure sits above the input. */}
        <div className="border-t border-border bg-background px-4 pt-3 sm:px-6 lg:hidden">
          <SpecSidebar draft={draft} variant="mobile" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-border bg-background px-4 py-3 sm:px-6 lg:border-t"
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
      </div>

      <SpecSidebar draft={draft} variant="desktop" />
    </main>
  );
}
