"use client";

/**
 * MUST-SHIP #8 + #9 — once the draft spec is ready, surface two actions
 * directly in the chat surface:
 *
 *   - "Preview tomorrow's brief" — composes with `dryRun: true`, which
 *     skips the 5min cooldown, the credit debit, AND the Telegram send.
 *     Returns markdown we render in-page so the user can see what they
 *     bought before linking Telegram or committing credits.
 *
 *   - "Send me one now" — composes with `dryRun: false`. Only shown when
 *     Telegram is linked (otherwise the brief has nowhere to land).
 *     Inherits the 5min cooldown from MUST-SHIP #1.
 *
 * Both call `digest.sampleNow`. The cooldown sits at the tRPC layer; the
 * UI surfaces TRPCError("TOO_MANY_REQUESTS") as a friendly inline note.
 *
 * Why one component for both: they share the same gating (isReady), the
 * same mutation surface, and the same "did Cadence already use this
 * minute?" feedback. Splitting them duplicates the loading/error
 * boilerplate without UX benefit.
 */
import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; markdown: string }
  | { kind: "error"; message: string };

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "cooldown"; message: string }
  | { kind: "no_credits"; message: string }
  | { kind: "error"; message: string };

export function BriefActions({
  ready,
  savedSpecId,
}: {
  ready: boolean;
  /**
   * Dogfood-bugs 2026-06-09: spec id of the most recent `confirm_and_save`
   * tool result on this thread, or null when the agent hasn't saved yet.
   * The buttons stay disabled until this is non-null because firing
   * `sampleNow` against the user's stale `is_current` spec composed
   * briefs on the wrong topic (e.g. a user configuring "Bitcoin" in
   * chat got an "AI / LLM platforms" sample composed from the prior
   * smoke-seed spec). When non-null, we send it as `expectedSpecId`
   * so the server defends in depth.
   */
  savedSpecId: string | null;
}) {
  const telegramStatus = trpc.telegram.status.useQuery(undefined, {
    enabled: ready,
    refetchOnWindowFocus: false,
  });
  const sampleMut = trpc.digest.sampleNow.useMutation();
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [send, setSend] = useState<SendState>({ kind: "idle" });

  if (!ready) return null;
  const saved = savedSpecId != null;

  const linked = telegramStatus.data?.linked ?? false;

  async function onPreview() {
    if (!savedSpecId) return;
    setPreview({ kind: "loading" });
    try {
      const res = await sampleMut.mutateAsync({
        dryRun: true,
        expectedSpecId: savedSpecId,
      });
      if (res.markdown && res.markdown.length > 0) {
        setPreview({ kind: "ready", markdown: res.markdown });
      } else if (res.status === "skipped_no_credits") {
        setPreview({
          kind: "error",
          message: "Out of credits — top up to preview.",
        });
      } else {
        setPreview({
          kind: "error",
          message: res.error ?? "Couldn't write a preview right now.",
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Preview failed.";
      setPreview({ kind: "error", message });
    }
  }

  async function onSendNow() {
    if (!savedSpecId) return;
    setSend({ kind: "sending" });
    try {
      const res = await sampleMut.mutateAsync({
        dryRun: false,
        expectedSpecId: savedSpecId,
      });
      if (res.status === "delivered") {
        setSend({ kind: "sent" });
      } else if (res.status === "skipped_no_credits") {
        setSend({
          kind: "no_credits",
          message: "Out of credits — top up to send a sample.",
        });
      } else if (res.status === "no_telegram_link") {
        setSend({
          kind: "error",
          message: "Connect Telegram first — that's where your brief gets delivered.",
        });
      } else {
        setSend({
          kind: "error",
          message: res.error ?? `Send failed (${res.status}).`,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Send failed.";
      // tRPC surfaces TOO_MANY_REQUESTS for the cooldown.
      if (/many requests|few minutes/i.test(message)) {
        setSend({
          kind: "cooldown",
          message: "You just sent one. Try again in a few minutes.",
        });
      } else {
        setSend({ kind: "error", message });
      }
    }
  }

  return (
    <div
      data-testid="brief-actions"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-md border border-border bg-card/40 p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight">
          Your brief is ready. Want to see it?
        </h3>
        <p className="text-xs text-muted-foreground">
          Preview a sample brief from this setup, or send one to your Telegram
          right now.
        </p>
      </div>

      {!saved && (
        <p
          data-testid="brief-actions-needs-save"
          className="text-xs text-muted-foreground"
        >
          Finish setting up your brief in chat first.
        </p>
      )}

      {/* dead-surface fix 2026-06-09: replaced the chat-client auto-redirect
          to /app/link with this inline CTA. Surfaces once the spec is saved
          AND Telegram isn't linked — the single most important next action
          for the user, made explicit instead of teleported-to. Once linked
          this banner disappears and the BriefActions buttons become the
          primary surface. */}
      {saved && !linked && (
        <Link
          data-testid="brief-actions-link-telegram-cta"
          href="/app/link"
          className="inline-flex items-center justify-between gap-3 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>
            Your brief is saved. Connect Telegram so it has somewhere to land
          </span>
          <span aria-hidden>&rarr;</span>
        </Link>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="brief-actions-preview"
          onClick={onPreview}
          disabled={!saved || preview.kind === "loading"}
          className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {preview.kind === "loading"
            ? "Writing preview…"
            : "Preview a sample"}
        </button>
        {linked ? (
          <button
            type="button"
            data-testid="brief-actions-send-now"
            onClick={onSendNow}
            disabled={!saved || send.kind === "sending"}
            className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {send.kind === "sending" ? "Sending…" : "Send to Telegram now"}
          </button>
        ) : (
          // dead-surface fix 2026-06-09: previously a disabled <span> badge.
          // Converted to a real <Link> to /app/link so users can act on it.
          <Link
            data-testid="brief-actions-link-telegram"
            href="/app/link"
            className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Connect Telegram first &rarr;
          </Link>
        )}
      </div>

      {send.kind === "sent" && (
        <p className="text-xs text-success">
          Sent — check Telegram.
        </p>
      )}
      {send.kind === "cooldown" && (
        <p className="text-xs text-warning">
          {send.message}
        </p>
      )}
      {(send.kind === "no_credits" || send.kind === "error") && (
        <p className="text-xs text-destructive">{send.message}</p>
      )}

      {preview.kind === "ready" && (
        <div
          data-testid="brief-actions-preview-body"
          className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 text-[13px] leading-relaxed"
        >
          {preview.markdown}
        </div>
      )}
      {preview.kind === "error" && (
        <p className="text-xs text-destructive">{preview.message}</p>
      )}
    </div>
  );
}
