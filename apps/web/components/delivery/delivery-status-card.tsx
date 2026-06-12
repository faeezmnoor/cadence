"use client";

/**
 * Settings-surfacing v1 (gap 3) — Telegram delivery status + disconnect.
 *
 * Design §2/§7 component 6. Three states from telegram.status:
 *   - linked  : success dot + @username, plus "Disconnect Telegram" as a
 *               muted text link (rare, semi-destructive — a button would
 *               give it CTA weight) with an inline-reveal confirm
 *               (archive-confirm idiom, never window.confirm). No "Open
 *               Telegram" button — review CPO LOW-5 / CTO P3-4: it linked
 *               to the user's own profile, not the bot chat, and was
 *               unrequested scope.
 *   - unlinked: plain statement + the verbatim "Connect Telegram" action
 *               routing to /app/link (which owns token issuance).
 *   - broken  : users.state = delivery_broken → warning idiom + reconnect.
 *
 * Variants:
 *   - "hub"  : the full status card on /settings.
 *   - "link" : only the disconnect affordance, rendered under the
 *              existing /app/link flow when linked (that page already
 *              owns connect + sample UX — no duplicate surface).
 */
import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

export function DeliveryStatusCard({
  variant = "hub",
}: {
  variant?: "hub" | "link";
}) {
  const utils = trpc.useUtils();
  const status = trpc.telegram.status.useQuery();
  const unlink = trpc.telegram.unlink.useMutation({
    onSuccess: async () => {
      setConfirming(false);
      setJustDisconnected(true);
      await utils.telegram.status.invalidate();
    },
  });
  const [confirming, setConfirming] = useState(false);
  const [justDisconnected, setJustDisconnected] = useState(false);

  const linked = status.data?.linked ?? false;
  const username = status.data?.username ?? null;
  const broken = status.data?.state === "delivery_broken";

  const disconnectBlock = confirming ? (
    <div className="mt-3 rounded-md border border-border bg-background p-3 text-sm">
      <p className="text-foreground">
        Disconnect Telegram? Briefs can&apos;t be delivered until you connect
        again. Nothing is deleted, and credits aren&apos;t touched.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => unlink.mutate()}
          disabled={unlink.isPending}
          className="inline-flex min-h-11 items-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 sm:min-h-9"
        >
          {unlink.isPending ? "Disconnecting…" : "Yes, disconnect"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={unlink.isPending}
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:min-h-9"
        >
          Keep it
        </button>
      </div>
      {unlink.isError && (
        <p className="mt-2 text-xs text-destructive">
          Couldn&apos;t disconnect. Nothing changed. Try again.
        </p>
      )}
    </div>
  ) : (
    // Designer P2: text link keeps its visual weight but gets a ≥44px
    // hit area (min-h-11 inline-flex) for touch.
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-3 inline-flex min-h-11 items-center text-xs text-muted-foreground underline underline-offset-2 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
    >
      Disconnect Telegram
    </button>
  );

  // /app/link variant: the page already renders connect + linked UX —
  // we only add the disconnect affordance when linked.
  if (variant === "link") {
    if (status.isLoading || !linked) return null;
    return <div data-testid="delivery-disconnect">{disconnectBlock}</div>;
  }

  if (status.isLoading) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Checking your Telegram connection…
      </p>
    );
  }

  if (broken) {
    return (
      <div className="mt-3" data-testid="delivery-status-broken">
        <p className="text-sm text-warning">
          We couldn&apos;t reach your Telegram. Briefs are on hold until you
          reconnect — no credits are used while disconnected.
        </p>
        <Link
          href={"/app/link" as never}
          className="mt-3 inline-flex h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          Reconnect Telegram
        </Link>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="mt-3" data-testid="delivery-status-unlinked">
        {justDisconnected && (
          <p className="mb-2 text-xs text-muted-foreground" role="status">
            Disconnected.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Telegram isn&apos;t connected. Briefs can&apos;t be delivered until
          it is — deliveries are on hold and no credits are used while
          disconnected.
        </p>
        <Link
          href={"/app/link" as never}
          className="mt-3 inline-flex h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          Connect Telegram
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3" data-testid="delivery-status-linked">
      <p className="inline-flex items-center gap-2 text-sm text-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full bg-success"
          aria-hidden="true"
        />
        <span>
          Connected to Telegram{username ? ` · @${username}` : ""}
        </span>
      </p>
      {/* CPO LOW-5 / CTO P3-4: "Open Telegram" removed — t.me/<username>
          opened the USER's profile, not the Cadence bot chat. */}
      {disconnectBlock}
    </div>
  );
}
