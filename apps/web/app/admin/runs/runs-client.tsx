"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

/**
 * /admin/runs — client component for the runs viewer.
 *
 * Uses tRPC's `useInfiniteQuery` for keyset pagination — the server returns
 * `nextCursor` so the client never trusts an offset count.
 *
 * Filter: brokenOnly toggle restarts pagination from the top.
 *
 * Each row gets a placeholder "Replay (T-305)" button. Wiring the actual
 * replay path is CAD-40 / T-305; this PR just reserves the visual slot so
 * the row layout stays stable when the mutation lands.
 */
export function RunsClient({ adminEmail }: { adminEmail: string }) {
  const [brokenOnly, setBrokenOnly] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const query = trpc.admin.listRuns.useInfiniteQuery(
    { limit: 25, brokenOnly },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }
  );

  /**
   * T-305: manual replay. We don't optimistically mutate the row — the
   * server has already reset attempt_count/last_error in-place by the time
   * `onSuccess` fires, so a short delay + refetch gives the admin honest
   * state without us having to model the reset client-side.
   */
  const replayRun = trpc.admin.replayRun.useMutation({
    onSuccess: async (_data, vars) => {
      setToast(`Replay queued for ${vars.runId.slice(0, 8)}…`);
      // Tiny delay so the worker has a moment to start; the row's status
      // pill will flip back through pending -> composing -> delivered.
      setTimeout(() => {
        void utils.admin.listRuns.invalidate();
      }, 500);
      setTimeout(() => setToast(null), 4000);
    },
    onError: (err) => {
      setToast(`Replay failed: ${err.message}`);
      setTimeout(() => setToast(null), 6000);
    },
  });

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.rows) ?? [],
    [query.data]
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin · Runs</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {adminEmail}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={brokenOnly}
            onChange={(e) => setBrokenOnly(e.target.checked)}
            className="h-4 w-4"
          />
          Broken users only
        </label>
      </header>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
        >
          {toast}
        </div>
      ) : null}

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading runs…</p>
      ) : query.isError ? (
        <p className="text-sm text-red-600">
          Failed to load runs: {query.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {brokenOnly
            ? "No runs from delivery-broken users."
            : "No runs yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">When (UTC)</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Spec</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Attempts</th>
                <th className="px-3 py-2 font-medium">Last error</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-neutral-700">
                    {formatUtc(r.deliveryMinuteUtc ?? r.createdAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-neutral-900">{r.userEmail}</div>
                    {r.userState === "delivery_broken" ? (
                      <div className="text-xs text-red-600">
                        delivery_broken
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link
                      href={`/spec?spec=${r.specId}`}
                      className="text-blue-600 hover:underline"
                    >
                      v{r.specVersion}
                    </Link>
                    {r.specIsSmoke ? (
                      <span
                        title="Smoke / dogfood spec"
                        className="ml-1 text-xs text-neutral-400"
                      >
                        🧪
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusPill
                      status={r.status}
                      brokenUser={r.userState === "delivery_broken"}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {r.attemptCount}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {r.lastError ? (
                      <span title={r.lastError}>{r.lastError}</span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => replayRun.mutate({ runId: r.id })}
                      disabled={
                        replayRun.isPending && replayRun.variables?.runId === r.id
                      }
                      title="Reset attempt_count + last_error and re-dispatch."
                      className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {replayRun.isPending && replayRun.variables?.runId === r.id
                        ? "Queuing…"
                        : "Replay"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </main>
  );
}

function formatUtc(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // YYYY-MM-DD HH:mm UTC — compact, sortable, tz-explicit.
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function StatusPill({
  status,
  brokenUser,
}: {
  status: string;
  brokenUser: boolean;
}) {
  // The runs table has its own per-row status; user-level delivery_broken is
  // surfaced in the User column. Keep this purely about the row's lifecycle.
  let cls = "bg-neutral-100 text-neutral-700";
  if (status === "delivered") cls = "bg-emerald-100 text-emerald-800";
  else if (status === "failed") cls = "bg-red-100 text-red-800";
  else if (status === "pending" || status === "composing")
    cls = "bg-amber-100 text-amber-800";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      data-broken-user={brokenUser}
    >
      {status}
    </span>
  );
}
