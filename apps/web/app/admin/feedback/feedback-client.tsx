"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * /admin/feedback — feedback-eval viewer client.
 *
 * Surfaces the same metrics computed by the daily eval cron. The smoke
 * spec's row floats to the top by default (smokeFirst), so Faeez can
 * see at a glance whether his dogfood spec is producing signal.
 */
export function FeedbackEvalClient({ adminEmail }: { adminEmail: string }) {
  const [smokeFirst, setSmokeFirst] = useState(true);
  const [smokeOnly, setSmokeOnly] = useState(false);

  const query = trpc.admin.listFeedbackEvals.useQuery({
    limit: 100,
    smokeFirst,
    smokeOnly,
  });

  const rows = query.data?.rows ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin · Feedback eval</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {adminEmail} · 7-day rolling window · recomputed daily 09:30 MYT
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={smokeFirst}
              onChange={(e) => setSmokeFirst(e.target.checked)}
              className="h-4 w-4"
            />
            Smoke first
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={smokeOnly}
              onChange={(e) => setSmokeOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Smoke only
          </label>
        </div>
      </header>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading eval rows…</p>
      ) : query.isError ? (
        <p className="text-sm text-red-600">
          Failed to load eval rows: {query.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No eval rows yet. The cron runs daily at 09:30 MYT and only
          recomputes users with brief/feedback activity in the last 24h.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Window end</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Briefs</th>
                <th className="px-3 py-2 font-medium">Taps</th>
                <th className="px-3 py-2 font-medium">Engage %</th>
                <th className="px-3 py-2 font-medium">Positive %</th>
                <th className="px-3 py-2 font-medium">/tune</th>
                <th className="px-3 py-2 font-medium">Distilled</th>
                <th className="px-3 py-2 font-medium">Last brief</th>
                <th className="px-3 py-2 font-medium">Last tap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {rows.map((r) => (
                <tr key={`${r.userId}:${r.windowEndDate}`} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-neutral-700">
                    {r.windowEndDate}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-neutral-900">{r.userEmail}</div>
                    {r.isSmoke ? (
                      <div className="text-xs text-neutral-400" title="Smoke / dogfood user">
                        smoke
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {r.briefsDeliveredCount}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {r.keyboardTapsCount}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatPct(r.engagementRate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatPct(r.positiveRate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {r.tuneCommandsCount}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.distilledPrefsPresent ? (
                      <span className="text-emerald-700">yes</span>
                    ) : (
                      <span className="text-neutral-400">no</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-neutral-600">
                    {formatRelative(r.lastBriefAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-neutral-600">
                    {formatRelative(r.lastTapAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function formatPct(rate: string | number | null): string {
  if (rate === null || rate === undefined) return "—";
  const n = typeof rate === "string" ? Number(rate) : rate;
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatRelative(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
