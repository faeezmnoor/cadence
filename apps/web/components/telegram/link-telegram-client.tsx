"use client";

import { useEffect, useMemo, useState } from "react";
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
      <div className="rounded-lg border border-green-600/30 bg-green-50/50 p-5 dark:bg-green-950/20">
        <p className="text-base font-semibold text-green-700 dark:text-green-300">
          Telegram connected
          {statusQuery.data?.username ? ` · @${statusQuery.data.username}` : ""}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re set. Your first brief arrives tomorrow at 07:00 MYT.
          Reply to any brief with feedback — Cadence learns from it.
        </p>
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
