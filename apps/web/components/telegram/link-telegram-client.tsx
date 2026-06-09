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
    // UX P0 #1: live progress card. The dead zone between "linked!" and
    // "brief lands in Telegram" is the largest single drop-off in the
    // funnel — users app-switch on the success screen and miss the
    // delivery. We now derive a 3-step state machine from existing local
    // state so the user sees forward motion in real time:
    //
    //   step 1 — Telegram linked    (always done once we reach this branch)
    //   step 2 — Crafting your brief (sampleStatus.kind === "sending")
    //   step 3 — Delivering to Telegram → ✅ Brief delivered
    //
    // Failure paths (no_credits / error) still surface inline so the user
    // isn't stuck on a fake "loading…" if anything went sideways.
    //
    // Auto-fire is already triggered via the autoSampleFiredRef effect; we
    // don't add new polling. The tRPC mutation already awaits delivery and
    // updates sampleStatus → that's our progress signal. No new infra.
    type StepState = "done" | "active" | "pending" | "failed";
    const step1: StepState = "done";
    const step2: StepState =
      sampleStatus.kind === "sending"
        ? "active"
        : sampleStatus.kind === "sent"
          ? "done"
          : sampleStatus.kind === "error" || sampleStatus.kind === "no_credits"
            ? "failed"
            : "pending";
    const step3: StepState =
      sampleStatus.kind === "sent"
        ? "done"
        : sampleStatus.kind === "sending"
          ? "active"
          : sampleStatus.kind === "error" || sampleStatus.kind === "no_credits"
            ? "failed"
            : "pending";

    const showHangWarning =
      sampleStatus.kind === "sending"; // Mutation timeout itself surfaces error.

    return (
      <div className="space-y-4">
        <div
          data-testid="link-progress-card"
          className="rounded-lg border border-green-600/30 bg-green-50/50 p-5 dark:bg-green-950/20"
        >
          <p className="text-base font-semibold text-green-700 dark:text-green-300">
            {sampleStatus.kind === "sent"
              ? "Brief delivered to Telegram"
              : "Almost there"}
            {statusQuery.data?.username
              ? ` · @${statusQuery.data.username}`
              : ""}
          </p>

          <ol
            data-testid="link-progress-steps"
            className="mt-3 space-y-2 text-sm"
            aria-label="Setup progress"
          >
            <ProgressStep
              state={step1}
              label="Telegram linked"
              testId="step-link"
            />
            <ProgressStep
              state={step2}
              label="Crafting your first brief"
              testId="step-compose"
            />
            <ProgressStep
              state={step3}
              label={
                step3 === "done"
                  ? "Delivered to Telegram"
                  : "Delivering to Telegram"
              }
              testId="step-deliver"
            />
          </ol>

          {sampleStatus.kind === "sent" && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Check your messaging app — your sample is waiting.
              </p>
              <a
                href={telegramAppLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-md bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90"
              >
                Open Telegram
              </a>
            </div>
          )}

          {sampleStatus.kind === "no_credits" && (
            <p className="mt-3 text-sm text-muted-foreground">
              {sampleStatus.scheduledNote}
            </p>
          )}

          {sampleStatus.kind === "error" && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Hmm, something&rsquo;s off. We&rsquo;ll retry — or contact{" "}
              <a
                href="mailto:support@cadence.news"
                className="underline hover:opacity-80"
              >
                support@cadence.news
              </a>
              .
            </p>
          )}

          {showHangWarning && (
            <p className="mt-3 text-xs text-muted-foreground">
              This usually takes 10–30 seconds. Hang tight.
            </p>
          )}

          {sampleStatus.kind === "idle" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Your first scheduled brief lands tomorrow at 07:00 MYT. Reply to
              any brief with feedback — Cadence learns from it.
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
            className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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

/**
 * UX P0 #1: one row in the post-link progress checklist.
 * States:
 *  - done    → solid green check + bold label
 *  - active  → animated dot + emphasized label (in-flight)
 *  - pending → muted dot + muted label (not started)
 *  - failed  → amber dot + amber label (composer/delivery error)
 *
 * Tiny component, kept in-file because it isn't reused elsewhere yet.
 */
function ProgressStep({
  state,
  label,
  testId,
}: {
  state: "done" | "active" | "pending" | "failed";
  label: string;
  testId?: string;
}) {
  const icon =
    state === "done" ? (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white"
        aria-hidden="true"
      >
        ✓
      </span>
    ) : state === "active" ? (
      <span
        className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-foreground"
        aria-hidden="true"
      />
    ) : state === "failed" ? (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
        aria-hidden="true"
      >
        !
      </span>
    ) : (
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-muted-foreground/40"
        aria-hidden="true"
      />
    );

  const textClass =
    state === "done"
      ? "text-foreground"
      : state === "active"
        ? "font-medium text-foreground"
        : state === "failed"
          ? "text-amber-700 dark:text-amber-300"
          : "text-muted-foreground";

  return (
    <li
      className="flex items-center gap-2.5"
      data-testid={testId}
      data-state={state}
    >
      {icon}
      <span className={textClass}>{label}</span>
    </li>
  );
}
