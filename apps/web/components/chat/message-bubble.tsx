"use client";

import { useState } from "react";
import type { Message } from "ai";
import { Markdown } from "./markdown";
import { Timestamp } from "./timestamp";
import { formatChatTimeAbsolute } from "@/lib/chat/format-time";
import { stripQuickReplyLeak } from "@/lib/chat/sanitize";

/**
 * One chat bubble. Surfaces:
 *  - user text on the right
 *  - assistant text + ask_user question on the left (rendered as markdown)
 *  - propose_spec / confirm_and_save tool results as a soft notice
 *
 * Wave 3 (CAD-181) additions:
 *  - markdown rendering via <Markdown> (whitelist + safe-href links)
 *  - meta-row with always-visible muted Timestamp + Copy button on last
 *    bubble in a group (caller controls via `isLastInGroup`)
 *  - "Cadence" caption above the FIRST assistant bubble in a group
 *  - grouping props determine corner rounding so consecutive same-sender
 *    bubbles read as one thought
 *  - role="article" + author-and-time aria-label for screen readers
 *
 * Backwards-compat: when caller doesn't pass `createdAt`, falls back to the
 * pre-Wave-3 layout (no meta-row, no grouping). Lets older callers stay
 * unbroken; ChatClient always passes the full set.
 */
export function MessageBubble({
  message,
  createdAt,
  isFirstInGroup = true,
  isLastInGroup = true,
  onCopy,
}: {
  message: Message;
  createdAt?: Date;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onCopy?: (text: string) => void;
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

  // Build a single text payload for the Copy button — prefer markdown
  // content, fall back to ask_user.question.
  let copyPayload = message.content || "";
  if (!copyPayload) {
    const askResult = askQuestion?.state === "result"
      ? (askQuestion.result as { question?: string } | undefined)
      : undefined;
    copyPayload = askResult?.question ?? "";
  }

  const ariaLabel = createdAt
    ? `${isUser ? "You" : "Cadence"} at ${formatChatTimeAbsolute(createdAt)}`
    : isUser
      ? "Your message"
      : "Cadence message";

  if (isUser) {
    // Corner rounding: full tail when alone or last in group; tighter
    // top-right when continued from above.
    const corners = isFirstInGroup
      ? isLastInGroup
        ? "rounded-2xl rounded-br-sm"
        : "rounded-2xl rounded-br-md"
      : isLastInGroup
        ? "rounded-2xl rounded-tr-md rounded-br-sm"
        : "rounded-2xl rounded-tr-md rounded-br-md";
    return (
      <article
        role="article"
        aria-label={ariaLabel}
        className="flex flex-col items-end gap-1 animate-chat-fade-in"
      >
        <div
          className={`max-w-[88%] bg-foreground px-4 py-2 text-sm text-background sm:max-w-[80%] ${corners}`}
        >
          <Markdown>{message.content || ""}</Markdown>
        </div>
        {isLastInGroup && createdAt && (
          <MetaRow
            align="right"
            at={createdAt}
            payload={copyPayload}
            onCopy={onCopy}
          />
        )}
      </article>
    );
  }

  const corners = isFirstInGroup
    ? isLastInGroup
      ? "rounded-2xl rounded-bl-sm"
      : "rounded-2xl rounded-bl-md"
    : isLastInGroup
      ? "rounded-2xl rounded-tl-md rounded-bl-sm"
      : "rounded-2xl rounded-tl-md rounded-bl-md";

  return (
    <article
      role="article"
      aria-label={ariaLabel}
      className="flex flex-col gap-1 animate-chat-fade-in"
    >
      {isFirstInGroup && (
        // Cadence caption per blueprint §2.3 — small muted label above first
        // assistant bubble in each group. Decorative; screen-reader picks up
        // the author from the article's aria-label.
        <span
          aria-hidden="true"
          className="px-1 text-[11px] font-medium text-muted-foreground"
        >
          Cadence
        </span>
      )}
      <div
        className={`max-w-[88%] border border-border bg-card px-4 py-3 text-sm sm:max-w-[85%] ${corners}`}
      >
        {/*
         * Wave 4 Bug 3 fix (regression from PR#4 02f2fd2): assistant turns
         * can carry BOTH free-text in message.content AND an ask_user tool
         * call whose `question` field often paraphrases that same text.
         * Pre-Wave-3 the in-bubble ask_user render was the only source of
         * truth; Wave 3 added the markdown content render but kept the
         * legacy ToolAskUser fallthrough — so users see the same question
         * rendered twice (one markdown, one ToolAskUser). Render exactly
         * one source: prefer the free-text content, fall back to the
         * ask_user question only when content is empty (tool-only turns).
         */}
        {message.content ? (
          // Wave 5 Bug 12 (P0): scrub embedded quick-reply chip JSON at
          // render time so already-persisted messages render clean
          // alongside the route.ts onFinish server-side scrub.
          <Markdown>{stripQuickReplyLeak(message.content)}</Markdown>
        ) : (
          askQuestion?.state === "result" && (
            <ToolAskUser invocation={askQuestion} />
          )
        )}
      </div>

      {proposedSpec?.state === "result" && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          Brief drafted — review it and reply to confirm or tweak.
        </div>
      )}
      {savedSpec?.state === "result" && (
        <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          Brief saved.
        </div>
      )}

      {isLastInGroup && createdAt && (
        <MetaRow
          align="left"
          at={createdAt}
          payload={copyPayload}
          onCopy={onCopy}
        />
      )}
    </article>
  );
}

/**
 * Always-visible muted meta-row with timestamp + Copy button.
 *
 * Mobile rule (blueprint §2.2): always-visible muted text. Desktop hover
 * is handled by the Timestamp `title` tooltip.
 */
function MetaRow({
  align,
  at,
  payload,
  onCopy,
}: {
  align: "left" | "right";
  at: Date;
  payload: string;
  onCopy?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      onCopy?.(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Insecure context — silently no-op.
    }
  };
  return (
    <div
      className={`flex items-center gap-2 px-1 text-[11px] text-muted-foreground ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <Timestamp at={at} />
      {payload && (
        <button
          type="button"
          onClick={handle}
          aria-label="Copy message"
          className="inline-flex items-center rounded px-1 py-0.5 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

/**
 * Lightweight ask_user rendering — pulls the `question` field out of the
 * tool result and renders it as markdown. Suggestions are owned by the
 * below-bubble strip in chat-client (UX audit v2 P0 #2).
 */
function ToolAskUser({
  invocation,
}: {
  invocation: NonNullable<Message["toolInvocations"]>[number] & {
    state: "result";
  };
}) {
  const result = invocation.result as { question?: string } | undefined;
  const question = result?.question;
  if (!question) return null;
  return (
    <div className="mt-2">
      <Markdown>{question}</Markdown>
    </div>
  );
}
