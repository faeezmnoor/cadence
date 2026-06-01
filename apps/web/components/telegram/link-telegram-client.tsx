"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

interface Props {
  userId: string;
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
export function LinkTelegramClient({ userId }: Props) {
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
      <div className="rounded-lg border border-green-600/30 bg-green-50/40 p-4 dark:bg-green-950/20">
        <p className="text-sm font-medium text-green-700 dark:text-green-300">
          Linked
          {statusQuery.data?.username ? ` as @${statusQuery.data.username}` : ""}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          You'll get your next brief on schedule. Reply to any brief with
          feedback — Cadence will adjust.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!botConfigured && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50/40 p-3 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          Bot not yet configured. Set <code>TELEGRAM_BOT_TOKEN</code> and{" "}
          <code>BOT_USERNAME</code> in env. See docs/TELEGRAM_BOT_SETUP.md.
        </div>
      )}

      {issuingError && (
        <p className="text-sm text-destructive">Couldn't issue link: {issuingError}</p>
      )}

      {token ? (
        <a
          href={token.deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Open Telegram to link
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">Issuing link…</p>
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
