"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

/**
 * /admin/users client — table view, sortable, "include deleted" toggle.
 *
 * Format: cost as $0.0000 (4 decimals — per-user lifetime is small).
 * Last-run is rendered relative ("2 days ago") via a tiny pure helper
 * (no date-fns dep — the project only uses it server-side in cron).
 *
 * State pill: green=active, red=delivery_broken, gray=deleted, neutral=paused.
 *
 * Aggregate row sits above the table so Faeez can eyeball total spend +
 * outstanding-credits liability without scrolling.
 */
type SortBy = "cost" | "balance" | "created" | "last_run";

function formatUsd(v: number): string {
  return `$${v.toFixed(4)}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

function StatePill({ state, deleted }: { state: string; deleted: boolean }) {
  if (deleted) {
    return (
      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
        deleted
      </span>
    );
  }
  if (state === "delivery_broken") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
        delivery_broken
      </span>
    );
  }
  if (state === "paused") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
        paused
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
      {state}
    </span>
  );
}

export function UsersClient({ adminEmail }: { adminEmail: string }) {
  const [sortBy, setSortBy] = useState<SortBy>("cost");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const query = trpc.admin.listUsers.useQuery({
    sortBy,
    includeDeleted,
    limit: 100,
  });

  const totals = useMemo(() => {
    const rows = query.data?.rows ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.balance += r.creditsBalance;
        acc.cost += r.costToUsUsd;
        acc.delivered += r.deliveredBriefs;
        acc.failed += r.failedBriefs;
        acc.count += 1;
        return acc;
      },
      { balance: 0, cost: 0, delivered: 0, failed: 0, count: 0 }
    );
  }, [query.data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Users</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Per-user cost to us + credit balance. Signed in as {adminEmail}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-neutral-700">
            <span>Sort by</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              <option value="cost">Cost (USD)</option>
              <option value="balance">Credits balance</option>
              <option value="created">Created</option>
              <option value="last_run">Last run</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-neutral-700">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            <span>Include deleted</span>
          </label>
        </div>
      </div>

      {/* Aggregate strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div className="text-xs text-neutral-500">Users shown</div>
          <div className="text-lg font-semibold tabular-nums">{totals.count}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div className="text-xs text-neutral-500">Σ Credits balance</div>
          <div className="text-lg font-semibold tabular-nums">
            {totals.balance}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div className="text-xs text-neutral-500">Σ Cost to us</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatUsd(totals.cost)}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div className="text-xs text-neutral-500">Σ Delivered</div>
          <div className="text-lg font-semibold tabular-nums">
            {totals.delivered}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div className="text-xs text-neutral-500">Σ Failed</div>
          <div className="text-lg font-semibold tabular-nums">
            {totals.failed}
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="rounded border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Loading users…
        </div>
      ) : query.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load: {query.error.message}
        </div>
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <div className="rounded border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          No users to show.
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
                <th className="px-3 py-2 font-medium text-right">Net debits</th>
                <th className="px-3 py-2 font-medium text-right">Credits in</th>
                <th className="px-3 py-2 font-medium text-right">Cost (USD)</th>
                <th className="px-3 py-2 font-medium text-right">Delivered</th>
                <th className="px-3 py-2 font-medium text-right">Failed</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {query.data!.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link
                      href={`/admin/runs?userId=${r.id}`}
                      className="text-blue-600 hover:underline"
                      title={r.id}
                    >
                      {r.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatePill state={r.state} deleted={!!r.deletedAt} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                    {r.creditsBalance}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-neutral-500">
                    {r.netDebits}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-neutral-500">
                    {r.totalCreditsIn}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums font-medium">
                    {formatUsd(r.costToUsUsd)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-emerald-700">
                    {r.deliveredBriefs}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-red-600">
                    {r.failedBriefs || ""}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-600">
                    {formatRelative(r.lastRunAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-500">
                    {formatRelative(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
