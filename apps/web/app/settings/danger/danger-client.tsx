"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { SUPPORT_EMAIL } from "@/server/support/contact";

/**
 * Typed-confirmation account deletion.
 *
 * UX contract:
 *  - Button is disabled until the user types DELETE exactly into the
 *    confirmation input. We don't lowercase-fuzzy-match — the literal
 *    "DELETE" is the same string the server zod-validates on, so the
 *    client and server agree on intent.
 *  - On success we sign the user out via the browser supabase client
 *    (clears the cookie session in this tab) and redirect to /?deleted=1.
 *    The marketing home can choose to render a goodbye if it wants —
 *    keeping that decision on the marketing side.
 *  - On error we surface the server message inline. The mutation throws
 *    INTERNAL_SERVER_ERROR if the service-role key is missing on prod,
 *    so the user gets a path to support instead of a silent half-delete.
 */
export function DangerZoneClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteSelf = trpc.account.deleteSelf.useMutation({
    onSuccess: async () => {
      try {
        await getSupabaseBrowser().auth.signOut();
      } catch {
        // Cookie-cleanup failure is non-fatal — the auth row is already
        // gone server-side, and the cookie will be cleared on next nav.
      }
      // Hard nav so middleware-attached auth state is fully discarded.
      window.location.assign("/?deleted=1");
    },
    onError: (e) => {
      setError(e.message);
    },
  });

  const canSubmit = confirm === "DELETE" && !deleteSelf.isPending;

  return (
    <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
      <h2 className="text-base font-semibold text-destructive">
        Delete my account
      </h2>

      <p className="mt-3 text-sm text-foreground/90">
        This will immediately:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/80">
        <li>Disassociate <span className="font-mono text-xs">{userEmail}</span> from your Cadence account.</li>
        <li>Pause and remove your active brief spec and chat history.</li>
        <li>Remove your linked Telegram chat and stop all future briefs.</li>
        <li>Sign you out of every device and revoke your auth session.</li>
        <li>
          Cascade-delete chat threads, feedback, learning log, and digest run
          records tied to your user_id.
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Financial records (credit purchases, refunds) are retained per Malaysian
        tax law but contain no profile data. There is no 24-hour grace window —
        delete means delete.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Why are you leaving?</span>{" "}
          <span className="text-muted-foreground">(optional, helps us improve)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Not useful, too expensive, found a better tool, etc."
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">
            Type <span className="font-mono text-destructive">DELETE</span> to confirm
          </span>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
          />
        </label>

        {error ? (
          <p className="text-sm text-destructive">
            {error}
            {" "}
            <a
              className="underline-offset-2 hover:underline"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              Contact support
            </a>
            .
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              setError(null);
              deleteSelf.mutate({
                confirm: "DELETE",
                reason: reason.trim() || undefined,
              });
            }}
            className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleteSelf.isPending ? "Deleting…" : "Delete my account"}
          </button>
          <button
            type="button"
            disabled={deleteSelf.isPending}
            onClick={() => router.push("/settings" as never)}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
