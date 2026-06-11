"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Message } from "ai";
import type { PersistedMessage } from "./types";
import { MessageBubble } from "./message-bubble";
import { SpecSidebar, type DraftLike } from "./spec-sidebar";
import { isReady as draftIsReady } from "./spec-sidebar.helpers";
import { pickLatestQuickReplies } from "./quick-replies";
import { BriefActions } from "./brief-actions";
import { DateSeparator } from "./date-separator";
import { TypingDots } from "./typing-dots";
import { usePinnedScroll } from "./use-pinned-scroll";
import { groupMessages } from "@/lib/chat/group";
import { trpc } from "@/lib/trpc/client";
import {
  detectMultiTopic,
  MULTI_TOPIC_REFUSAL,
} from "@/lib/chat/multi-topic";
import {
  VISIBLE_TEMPLATES,
  type DigestTemplate,
} from "@/lib/digest-spec/templates";
import { StarterCards } from "./starter-cards";
import { BriefGallery } from "./brief-gallery";

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
  sessionEmail,
  initialTemplateId = null,
}: {
  threadId: string;
  initialMessages: PersistedMessage[];
  initialDraft: DraftLike;
  /** Email from the Supabase session, used to pre-fill the BM/中文 opt-in
   *  form (QA P2 #2). Null if the auth provider didn't surface one. */
  sessionEmail: string | null;
  /**
   * PR 3: validated `/chat?template=<id>` deep-link (server-checked:
   * known AND visible). Auto-submits that template's exampleQuery once,
   * only on a fresh thread. Null = no deep-link.
   */
  initialTemplateId?: string | null;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

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
        const text = m.content.text?.trim() || askResult?.question;
        // Tool-only turns (e.g. a silent spec update) carry no user-visible
        // text — drop them from the hydrated transcript instead of
        // rendering a placeholder bubble.
        if (!text) return null;
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
  const appendMsg = trpc.chat.appendMessage.useMutation();

  // MUST-SHIP #5: when the user proposes 3+ topics in one message, refuse
  // gracefully instead of letting the config agent silently fold them all
  // into one spec. Track an ephemeral chip set sourced from the detector
  // — tapping a chip re-enters the chat as a normal user message picking
  // a single topic, which the agent then handles as the brief topic.
  const [refusalChips, setRefusalChips] = useState<string[]>([]);

  // Wave 4 Bug 5: track whether we've already auto-retried this turn so
  // a sustained outage doesn't loop. Reset on every successful onFinish.
  const autoRetriedRef = useState({ value: false });

  const { messages, input, handleInputChange, handleSubmit, status, error, append, setMessages, setInput, reload } =
    useChat({
      api: "/api/chat",
      id: threadId,
      initialMessages: hydrated,
      body: { threadId },
      onFinish: () => {
        // Pull the fresh draft so the sidebar reacts to whatever
        // update_spec_field / propose_spec wrote during this turn.
        void utils.chat.getDraft.invalidate({ threadId });
        // Successful round-trip — re-arm the auto-retry budget for the next
        // potential transient blip.
        autoRetriedRef[0].value = false;
      },
    });

  /**
   * Wave 4 Bug 5: parse the typed server envelope coming back through
   * useChat's `error.message`. Server emits a JSON envelope of
   * `{code,userMessage,supportRef}` from `getErrorMessage`. Anything that
   * doesn't parse (older deploys, network noise) falls back to a generic
   * friendly bubble.
   */
  const friendlyError = useMemo(() => {
    if (!error) return null;
    const raw = error.message ?? "";
    // Strip the legacy "[chat] " prefix if present (older deploys).
    const candidate = raw.replace(/^\[chat\]\s*/, "").trim();
    try {
      const parsed = JSON.parse(candidate) as {
        code?: string;
        userMessage?: string;
        supportRef?: string;
      };
      if (parsed && typeof parsed === "object" && parsed.userMessage) {
        return {
          code: parsed.code ?? "unknown",
          userMessage: parsed.userMessage,
          supportRef: parsed.supportRef ?? null,
        };
      }
    } catch {
      /* fall through */
    }
    return {
      code: "unknown",
      userMessage:
        "Something went wrong on our end. Tap retry to give it another go.",
      supportRef: null,
    };
  }, [error]);

  // Wave 4 Bug 5: auto-retry once on transient classes (timeout, 5xx,
  // rate-limit). Keeps the user out of a dead-end on a one-off blip.
  useEffect(() => {
    if (!friendlyError) return;
    if (autoRetriedRef[0].value) return;
    const transient =
      friendlyError.code === "timeout" ||
      friendlyError.code === "upstream_5xx" ||
      friendlyError.code === "rate_limited";
    if (!transient) return;
    autoRetriedRef[0].value = true;
    const t = setTimeout(() => {
      void reload();
    }, friendlyError.code === "rate_limited" ? 4000 : 1200);
    return () => clearTimeout(t);
  }, [friendlyError, reload, autoRetriedRef]);

  /**
   * MUST-SHIP #5: intercept submit. If the typed message looks like a
   * multi-topic enumeration (3+ candidates), short-circuit the round-trip:
   *  - clear the input
   *  - persist a user_text row (so resume-on-reload sees the typed message)
   *  - persist + render an assistant refusal bubble
   *  - render refusal chips (one per detected candidate); tapping a chip
   *    sends it as a normal user message and the chat resumes single-topic.
   * The assistant agent never sees the multi-topic message, so it can't
   * fold three topics into one spec.
   */
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const typed = input.trim();
    const detection = detectMultiTopic(typed);
    if (!detection.multiTopic) {
      handleSubmit(e);
      return;
    }
    e.preventDefault();
    // Optimistically render the user message + refusal so the UI feels
    // instant; persist both rows server-side for the resume case.
    const userId = `local-user-${Date.now()}`;
    const refusalId = `local-refusal-${Date.now()}`;
    setMessages([
      ...messages,
      { id: userId, role: "user", content: typed },
      { id: refusalId, role: "assistant", content: MULTI_TOPIC_REFUSAL },
    ]);
    setInput("");
    setRefusalChips(detection.candidates);
    void appendMsg.mutateAsync({
      threadId,
      role: "user",
      content: { kind: "user_text", text: typed },
    });
    void appendMsg.mutateAsync({
      threadId,
      role: "assistant",
      content: {
        kind: "assistant_turn",
        text: MULTI_TOPIC_REFUSAL,
        toolResults: [],
      },
    });
  };

  const handleRefusalChip = (chip: string) => {
    if (isStreamingState) return;
    setRefusalChips([]);
    void append({ role: "user", content: chip });
  };

  const isStreamingState = status === "submitted" || status === "streaming";

  // Stream E #7 (PM audit G4) — language honesty.
  // We only deliver briefs in English today. Until BM/中文 ship E2E, intercept
  // the language chips: instead of sending the chip as a user reply (which
  // would let the agent set language=ms / zh in the spec — a positioning
  // lie), capture interest and acknowledge.
  // See feedback_cadence_positioning.
  const registerLangInterest = trpc.interest.registerLanguage.useMutation();
  const [langAck, setLangAck] = useState<null | "ms" | "zh">(null);
  // QA P2 #2: explicit email opt-in. When the user taps a BM/中文 chip we
  // now show an inline form pre-filled with the session email (editable);
  // submitting the form is what records interest. Null = no prompt visible.
  const [langPrompt, setLangPrompt] = useState<null | "ms" | "zh">(null);
  const [langEmail, setLangEmail] = useState<string>(sessionEmail ?? "");
  const [langEmailError, setLangEmailError] = useState<string | null>(null);

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
      // QA P2 #2: intercept and surface the explicit opt-in form. We do
      // NOT mutate yet — the form submission is what records interest.
      setLangAck(null);
      setLangEmailError(null);
      setLangEmail((cur) => cur || sessionEmail || "");
      setLangPrompt(lang);
      return;
    }
    void append({ role: "user", content: text });
  };

  const submitLangInterest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!langPrompt) return;
    const trimmed = langEmail.trim();
    // Light client-side check — server validates with z.string().email().
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setLangEmailError("Enter a valid email address.");
      return;
    }
    const langForAck = langPrompt;
    registerLangInterest.mutate(
      { languageCode: langForAck, email: trimmed },
      {
        onSuccess: () => {
          setLangAck(langForAck);
          setLangPrompt(null);
        },
        // Best-effort: ack even on error so the user isn't stuck; the
        // row may still have written before the network blip.
        onError: () => {
          setLangAck(langForAck);
          setLangPrompt(null);
        },
      }
    );
  };

  // T-414 / CAD-74: chip strip below the latest assistant message.
  //
  // Source priority on the latest assistant turn:
  //   1. suggest_quick_replies.chips  (preferred — purpose-built tool)
  //   2. ask_user.suggestions         (fallback — model often skips #1)
  //
  // Dogfood-bugs 2026-06-09: c059029 removed the in-bubble ask_user
  // suggestion render in favor of a single below-bubble strip sourced
  // from suggest_quick_replies. In practice the config-agent doesn't
  // call suggest_quick_replies on every ask_user turn (LLM compliance
  // is fuzzy despite the system-prompt rule), so the chip strip
  // disappeared from brief-creation flows. Falling back to
  // ask_user.suggestions when the dedicated tool is absent restores
  // the chips without re-introducing the dual-strip bug (still exactly
  // one strip, rendered here).
  const latestQuickReplies = useMemo<string[]>(
    () => pickLatestQuickReplies(messages),
    [messages]
  );

  // Wave 3 (CAD-181): timestamp map. Hydrate from persisted createdAt for
  // every initial message; for new messages from useChat (which carry no
  // timestamp), stamp the first time we see the id and reuse on every
  // re-render. Stored as ISO so the dep array stays primitive-stable.
  const [createdAtById, setCreatedAtById] = useState<Record<string, string>>(
    () => {
      const seed: Record<string, string> = {};
      for (const m of initialMessages) {
        seed[m.id] = m.createdAt;
      }
      return seed;
    }
  );
  useEffect(() => {
    const additions: Record<string, string> = {};
    const nowIso = new Date().toISOString();
    for (const m of messages) {
      if (!createdAtById[m.id]) additions[m.id] = nowIso;
    }
    if (Object.keys(additions).length > 0) {
      setCreatedAtById((prev) => ({ ...prev, ...additions }));
    }
  }, [messages, createdAtById]);

  // Wave 3 (CAD-181): smart autoscroll — pauses when the user scrolls up
  // to re-read instead of yanking them back down on every new chunk.
  const { ref: scrollRef } = usePinnedScroll(messages.length);

  // Grouped render items — consecutive same-sender messages within 2 min
  // collapse into one visual group; per-day boundaries inject a separator.
  const groupedItems = useMemo(() => {
    const renderable = messages
      .map((m) => {
        const iso = createdAtById[m.id];
        // Brand-new client message not yet stamped — render with `now` so
        // it appears under "Today" until the effect above patches state.
        const createdAt = iso ? new Date(iso) : new Date();
        return {
          id: m.id,
          role: m.role as "user" | "assistant" | "tool",
          createdAt,
          raw: m,
        };
      })
      // Hide tool-only rows from grouping; renderer below skips them too.
      .filter((m) => m.role === "user" || m.role === "assistant");
    return groupMessages(renderable);
  }, [messages, createdAtById]);

  // dead-surface fix 2026-06-09: this useEffect previously router.push'd to
  // /app/link the instant confirm_and_save landed. It killed the BriefActions
  // surface (Preview / Send-me-one-now), which only enables AFTER savedSpecId
  // becomes non-null — i.e. exactly when the redirect fires. Net result:
  // users never saw the inline payoff buttons. Replaced with an inline
  // post-save CTA inside BriefActions itself: the user stays on /chat and
  // sees three explicit next actions (Preview, Send-now, Link Telegram).
  // /app/link is still reachable via the AppNav and via the inline CTA.

  // Dogfood-bugs 2026-06-09: surface the spec id of the latest
  // confirm_and_save tool result to BriefActions so its sample/preview
  // buttons stay disabled until the agent has actually persisted the
  // draft. Without this, clicking "Send me one now" before the agent
  // calls confirm_and_save fires `digest.sampleNow` against the user's
  // stale `is_current` spec (a prior smoke seed for users with one) and
  // composes a brief on the WRONG topic.
  const savedSpecId = useMemo<string | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.role !== "assistant") continue;
      const tool = m.toolInvocations?.find(
        (t) => t.toolName === "confirm_and_save" && t.state === "result"
      );
      if (tool && tool.state === "result") {
        const r = tool.result as { spec_id?: string } | undefined;
        return typeof r?.spec_id === "string" ? r.spec_id : null;
      }
    }
    return null;
  }, [messages]);

  const handleReset = async () => {
    if (isStreamingState || resetting) return;
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
      setConfirmingReset(false);
    }
  };

  const isStreaming = isStreamingState;
  const draft = (draftQuery.data ?? null) as DraftLike;

  const hasMessages = messages.length > 0;

  // Brief-creation revamp PR 1 (proposals/brief-creation-flow-proposal.md):
  // turn 0 shows two greeting bubbles + 3 starter cards (one per anchor
  // ICP) + the "Describe it in your words" escape hatch. The 10-pill cloud
  // and its autofill-and-edit behaviour are retired — a card tap is
  // informed consent and auto-submits the template's exampleQuery so the
  // agent can confirm-and-personalize instead of re-interviewing.
  //
  // Templates source of truth: apps/web/lib/digest-spec/templates.ts —
  // Faeez edits that file and redeploys (see the `visible` flag doc there).
  //
  // `templateId`/`templateSource` ride the request body so the server can
  // stamp chat_threads.template_id (provenance, migration 0026) and emit
  // template_selected telemetry. Note: per-request body REPLACES the
  // hook-level body in ai-sdk v4, so threadId must be re-sent here.
  const composerInputRef = useRef<HTMLInputElement>(null);
  // PR 3: "Browse all briefs" disclosure. Open swaps the starter cards for
  // the full catalog (desktop inline) / bottom sheet (mobile); close
  // restores the starters — reversible, never destructive.
  const [galleryOpen, setGalleryOpen] = useState(false);

  const handleTemplateSelect = (
    tpl: DigestTemplate,
    source: "starter_card" | "gallery" | "deep_link" = "starter_card"
  ) => {
    if (isStreamingState) return;
    setGalleryOpen(false);
    void append(
      { role: "user", content: tpl.exampleQuery },
      { body: { threadId, templateId: tpl.id, templateSource: source } }
    );
  };

  const handleDescribeOwn = () => {
    composerInputRef.current?.focus();
  };

  // PR 3: /chat?template=<id> deep-link — auto-submit once, fresh threads
  // only (a thread with history keeps its conversation; the deep-link is
  // an entry point, not an interrupt). The URL is then rewritten to /chat
  // so a reload doesn't re-fire the submission.
  const deepLinkFiredRef = useRef(false);
  useEffect(() => {
    if (!initialTemplateId || deepLinkFiredRef.current) return;
    if (messages.length > 0) return;
    const tpl = VISIBLE_TEMPLATES.find((t) => t.id === initialTemplateId);
    if (!tpl) return;
    deepLinkFiredRef.current = true;
    handleTemplateSelect(tpl, "deep_link");
    router.replace("/chat", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire-once mount effect
  }, []);

  return (
    <main className="flex min-h-0 flex-1 bg-background">
      <div className="flex flex-1 flex-col min-h-0">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
            Set up your brief
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <CreditPill />
            {confirmingReset ? (
              <span
                data-testid="chat-reset-confirm"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                Start over?
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetting}
                  className="inline-flex h-9 items-center rounded-md bg-destructive px-2.5 text-xs font-medium text-destructive-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetting ? "Resetting…" : "Yes, start over"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  disabled={resetting}
                  className="inline-flex h-9 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                disabled={isStreaming || resetting}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Start over"
                title="Start over"
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
                Start over
              </button>
            )}
          </div>
        </header>

        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation with Cadence"
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
        >
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {!hasMessages && (
              <div data-testid="chat-welcome" className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground"
                  >
                    C
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    Cadence
                  </span>
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm text-foreground">
                  I research your industry and send you a brief, on your
                  schedule.
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm text-foreground">
                  Tell me what to watch — in your own words.
                </div>
                {!galleryOpen && (
                  <StarterCards
                    onSelect={handleTemplateSelect}
                    onDescribeOwn={handleDescribeOwn}
                    onBrowseAll={() => setGalleryOpen(true)}
                    disabled={isStreaming}
                  />
                )}
                <BriefGallery
                  open={galleryOpen}
                  onClose={() => setGalleryOpen(false)}
                  onSelect={(tpl) => handleTemplateSelect(tpl, "gallery")}
                  disabled={isStreaming}
                />
              </div>
            )}
            {groupedItems.map((item) => {
              if (item.kind === "separator") {
                return <DateSeparator key={item.id} at={item.at} />;
              }
              return (
                <MessageBubble
                  key={item.message.id}
                  message={item.message.raw}
                  createdAt={item.message.createdAt}
                  isFirstInGroup={item.isFirstInGroup}
                  isLastInGroup={item.isLastInGroup}
                />
              );
            })}
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
            {langPrompt && (
              <form
                data-testid="language-interest-form"
                onSubmit={submitLangInterest}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-3 text-xs text-foreground"
                aria-label="Language launch email opt-in"
              >
                <p className="text-muted-foreground">
                  We&rsquo;ll email you when{" "}
                  {langPrompt === "ms" ? "Bahasa Malaysia" : "中文"} launches.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="sr-only" htmlFor="lang-interest-email">
                    Email
                  </label>
                  <input
                    id="lang-interest-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={langEmail}
                    onChange={(e) => {
                      setLangEmail(e.target.value);
                      if (langEmailError) setLangEmailError(null);
                    }}
                    disabled={registerLangInterest.isPending}
                    placeholder="you@example.com"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={registerLangInterest.isPending}
                      className="inline-flex h-7 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {registerLangInterest.isPending ? "Saving…" : "Notify me"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLangPrompt(null);
                        setLangEmailError(null);
                      }}
                      disabled={registerLangInterest.isPending}
                      className="inline-flex h-7 items-center rounded-md border border-border bg-background px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                {langEmailError && (
                  <p
                    role="alert"
                    className="text-[11px] text-destructive"
                  >
                    {langEmailError}
                  </p>
                )}
              </form>
            )}
            {langAck && (
              <div
                data-testid="language-interest-ack"
                role="status"
                className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
              >
                We&rsquo;ll email you when{" "}
                {langAck === "ms" ? "Bahasa Malaysia" : "中文"} launches
                (targeting July). For now, please continue in English.
              </div>
            )}
            {refusalChips.length > 0 && (
              <div
                data-testid="multi-topic-refusal-chips"
                className="flex flex-wrap gap-1.5"
                aria-label="Pick one topic"
              >
                {refusalChips.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    onClick={() => handleRefusalChip(c)}
                    disabled={isStreaming}
                    className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {isStreaming && <TypingDots />}
            {/* MUST-SHIP #8 + #9: once the spec is ready, surface preview +
                send-now actions inline so the user sees the payoff before
                leaving the chat. */}
            <BriefActions
              ready={draftIsReady(draft)}
              savedSpecId={savedSpecId}
            />
            {friendlyError && (
              <div
                data-testid="chat-error-bubble"
                role="status"
                className="rounded-2xl rounded-bl-sm border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-foreground"
              >
                <p>{friendlyError.userMessage}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void reload()}
                    disabled={isStreaming}
                    className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Retry
                  </button>
                  {friendlyError.supportRef && (
                    <span className="text-[11px] text-muted-foreground">
                      Support ref:{" "}
                      <code className="font-mono">{friendlyError.supportRef}</code>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile spec disclosure sits above the input. */}
        <div className="border-t border-border bg-background px-4 pt-3 sm:px-6 lg:hidden">
          <SpecSidebar draft={draft} variant="mobile" />
        </div>

        <form
          onSubmit={onSubmit}
          className="border-t border-border bg-background px-4 py-3 sm:px-6 lg:border-t"
        >
          <div className="mx-auto flex w-full max-w-2xl gap-2">
            <input
              ref={composerInputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              disabled={isStreaming}
              placeholder={
                hasMessages
                  ? "Type your reply…"
                  : "Describe what to watch — e.g. palm oil prices"
              }
              autoFocus
              className="block h-11 flex-1 rounded-md border border-input bg-background px-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-5 text-sm font-medium text-brand-foreground transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
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

/**
 * UX audit v2 P1 #1 — credit-balance pill in the chat header.
 *
 * A quiet counter so a user mid-conversation knows their balance without
 * leaving for /settings/billing. Pulled via tRPC; refetched on window
 * focus so a fresh debit (from a delivered brief) reflects when the user
 * returns to the tab. Suppressed during the initial load so the header
 * doesn't flash a placeholder, and hidden entirely on error so an admin
 * outage doesn't shout at the user.
 */
function CreditPill() {
  const balance = trpc.billing.getBalance.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  if (balance.isLoading || balance.isError) return null;
  const credits = balance.data?.creditsBalance ?? 0;
  return (
    <a
      href="/settings/billing"
      title="Credit balance — one credit per delivered brief"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`${credits} credits remaining`}
      data-testid="chat-credit-pill"
    >
      <span className="tabular-nums text-foreground">{credits}</span>
      <span className="hidden sm:inline">{credits === 1 ? "credit" : "credits"}</span>
    </a>
  );
}
