"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

interface Props {
  userId: string;
  /**
   * Admin gating for the "bot not configured" engineering banner.
   * Non-admins should never see env-var setup copy (audit Designer #4 / #2).
   * Defaults to false so the safe path is silence for end users.
   */
  isAdmin?: boolean;
}

/**
 * Link-Telegram client. Three states:
 *  - "checking": initial status query in flight
 *  - "unlinked": show deep-link button + token
 *  - "linked":   show success + @username
 *
 * Detection of "linked" is layered for reliability on bad networks:
 *  1. Realtime postgres_changes subscription on users row (target <5s)
 *  2. Fallback 5s poll on telegram.status (in case Realtime is disabled
 *     or the subscription handshake fails locally)
 */
export function LinkTelegramClient({ userId, isAdmin = false }: Props) {
  const statusQuery = trpc.telegram.status.useQuery(undefined, {
    refetchInterval: 5000, // fallback poll
  });
  const createToken = trpc.telegram.createLinkToken.useMutation();
  const [token, setToken] = useState<{
    token: string;
    deepLink: string;
    expiresAt: Date;
  } | null>(null);
  const [issuingError, setIssuingError] = useState<string | null>(null);

  const linked = statusQuery.data?.linked ?? false;
  const botConfigured = statusQuery.data?.botConfigured ?? false;

  /**
   * PM-audit #1 (activation cliff): the moment a user finishes linking we
   * fire one sample brief automatically so the very first thing they see
   * in their messaging app is a real Cadence delivery — not a placeholder
   * and not a 24-hour wait. Without this, signed-up-but-never-saw-output
   * users churn before their first scheduled brief.
   *
   * Trigger condition: linked transitions false -> true within this
   * mount AND we haven't already auto-fired (autoSampleFiredRef).
   * The ref ensures a status refetch flicker doesn't re-fire the mutation.
   *
   * Failure handling: surface a soft inline status, never block the
   * "Linked!" success UI. If the user is already over the cooldown from
   * a manual sample we silently swallow TOO_MANY_REQUESTS.
   */
  const sampleNow = trpc.digest.sampleNow.useMutation();
  const autoSampleFiredRef = useRef(false);
  const [sampleStatus, setSampleStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "no_credits"; scheduledNote: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Cache linked-tg deep link target so the "open Telegram" CTA is also
  // useful POST-link (e.g. "tap to open and find your sample").
  const telegramDeepUsername = statusQuery.data?.username;
  const telegramAppLink = telegramDeepUsername
    ? `https://t.me/${telegramDeepUsername}`
    : "https://t.me";

  function applySampleResult(
    res: { status: string },
    opts: { auto: boolean }
  ) {
    if (res.status === "delivered") {
      setSampleStatus({ kind: "sent" });
    } else if (res.status === "skipped_no_credits") {
      setSampleStatus({
        kind: "no_credits",
        scheduledNote:
          "Your trial credits are used. Top-up coming when Stripe lands — your next scheduled brief still arrives at 07:00 MYT.",
      });
    } else if (res.status === "no_telegram_link") {
      // shouldn't happen at this branch but handle gracefully
      setSampleStatus({
        kind: "error",
        message: "Couldn't deliver — Telegram not linked.",
      });
    } else if (res.status === "no_spec") {
      setSampleStatus({
        kind: "error",
        message: "No active spec — finish the chat first.",
      });
    } else if (res.status === "failed") {
      setSampleStatus({
        kind: "error",
        message: opts.auto
          ? "Couldn't compose right now. Your next scheduled brief still lands at 07:00 MYT."
          : "Couldn't compose right now. Try again in a few minutes.",
      });
    } else {
      setSampleStatus({ kind: "sent" });
    }
  }

  function triggerSample(opts: { auto: boolean }) {
    if (sampleStatus.kind === "sending") return;
    setSampleStatus({ kind: "sending" });
    sampleNow.mutate(
      { dryRun: false },
      {
        onSuccess: (res) => applySampleResult(res, opts),
        onError: (err) => {
          // Auto-fire path stays quiet on rate-limit — a stale re-render
          // could otherwise show a scary error on a working link page.
          if (
            opts.auto &&
            (err.data?.code === "TOO_MANY_REQUESTS" || /just sent/i.test(err.message))
          ) {
            setSampleStatus({ kind: "idle" });
            return;
          }
          setSampleStatus({ kind: "error", message: err.message });
        },
      }
    );
  }

  useEffect(() => {
    if (!linked) return;
    if (autoSampleFiredRef.current) return;
    autoSampleFiredRef.current = true;
    triggerSample({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  // Realtime subscription: nudge the status query as soon as the row flips.
  useEffect(() => {
    if (linked) return;
    let cleanup: (() => void) | undefined;
    try {
      const supabase = getSupabaseBrowser();
      const channel = supabase
        .channel(`users:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "users",
            filter: `id=eq.${userId}`,
          },
          () => {
            statusQuery.refetch();
          }
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      // Browser supabase not configured — fallback poll still works.
      console.warn("[link] realtime disabled", err);
    }
    return cleanup;
  }, [userId, linked, statusQuery]);

  // Auto-issue a token once on first unlinked render.
  useEffect(() => {
    if (!statusQuery.isSuccess) return;
    if (linked) return;
    if (token) return;
    if (createToken.isPending) return;
    createToken.mutate(undefined, {
      onSuccess: (data) =>
        setToken({
          token: data.token,
          deepLink: data.deepLink,
          expiresAt: data.expiresAt,
        }),
      onError: (e) => setIssuingError(e.message),
    });
  }, [statusQuery.isSuccess, linked, token, createToken]);

  const expiresInMin = useMemo(() => {
    if (!token) return null;
    return Math.max(
      0,
      Math.round((new Date(token.expiresAt).getTime() - Date.now()) / 60000)
    );
  }, [token]);

  if (statusQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Checking link status…</p>;
  }

  if (linked) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-green-600/30 bg-green-50/50 p-5 dark:bg-green-950/20">
          <p className="text-base font-semibold text-green-700 dark:text-green-300">
            Connected
            {statusQuery.data?.username ? ` · @${statusQuery.data.username}` : ""}
          </p>
          {sampleStatus.kind === "sending" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span
                className="inline-block h-3 w-3 animate-pulse rounded-full bg-muted-foreground/40 align-middle"
                aria-hidden="true"
              />{" "}
              Sending your first brief now…
            </p>
          ) : sampleStatus.kind === "sent" ? (
            <div className="mt-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Sent! Check your messaging app — your first brief is on its way.
              </p>
              <a
                href={telegramAppLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90"
              >
                Open and read it
              </a>
            </div>
          ) : sampleStatus.kind === "no_credits" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {sampleStatus.scheduledNote}
            </p>
          ) : sampleStatus.kind === "error" ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {sampleStatus.message} Your next scheduled brief still lands at
              07:00 MYT.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;re set. Your first brief arrives tomorrow at 07:00 MYT.
              Reply to any brief with feedback — Cadence learns from it.
            </p>
          )}
        </div>

        {/*
         * PM-audit #9: web-side "Send sample now" parity with the
         * Telegram /sample command. Same tRPC mutation as the
         * auto-fire path; server enforces a 5-minute cooldown.
         */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Want another sample later? Use the button below or send{" "}
            <code className="font-mono">/sample</code> to the bot.
          </p>
          <button
            type="button"
            onClick={() => triggerSample({ auto: false })}
            disabled={sampleStatus.kind === "sending"}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sampleStatus.kind === "sending"
              ? "Sending…"
              : "Send sample now"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!botConfigured && isAdmin && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50/40 p-3 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          Bot not yet configured. Set <code>TELEGRAM_BOT_TOKEN</code> and{" "}
          <code>BOT_USERNAME</code> in env. See docs/TELEGRAM_BOT_SETUP.md.
        </div>
      )}
      {!botConfigured && !isAdmin && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Linking is temporarily unavailable. Try again in a moment.
        </div>
      )}

      {issuingError && (
        <p className="text-sm text-destructive">Couldn&apos;t issue link: {issuingError}</p>
      )}

      {token ? (
        <a
          href={token.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 w-full items-center justify-center rounded-md bg-foreground px-6 text-base font-semibold text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
        >
          Open Telegram to link
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-muted-foreground/40 align-middle" aria-hidden="true" /> Preparing your link…
        </p>
      )}

      {token && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Or send <code className="font-mono">/start {token.token}</code> to
            the bot manually.
          </p>
          <p>
            Link expires in {expiresInMin} min. Tap{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setToken(null);
                setIssuingError(null);
              }}
            >
              issue a new one
            </button>{" "}
            if it stales.
          </p>
        </div>
      )}
    </div>
  );
}
