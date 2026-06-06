"use client";

/**
 * Phase B T4 — admin dispatcher trace client.
 *
 * Renders one row per UTC minute in the trace window with claimed /
 * delivered / failed / pending counts and a sampled last_error. Range
 * selector toggles between 15m / 60m / 240m windows.
 *
 * Refreshes every 30s so a triage session sees fresh data without
 * manual reload. No bulk-mutation actions — read-only.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const WINDOW_OPTIONS = [15, 60, 240] as const;

export function DispatchClient() {
  const [windowMin, setWindowMin] = useState<(typeof WINDOW_OPTIONS)[number]>(60);
  const trace = trpc.admin.dispatchTrace.useQuery(
    { lastNMinutes: windowMin },
    { refetchInterval: 30_000, refetchOnWindowFocus: true },
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cron dispatch trace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last {windowMin} minutes of cron dispatcher activity, derived from
            digest_runs grouped by created minute. Updates every 30s.
          </p>
        </div>
        <div className="flex gap-1.5">
          {WINDOW_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setWindowMin(m)}
              className={
                "inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition " +
                (m === windowMin
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted")
              }
            >
              {m === 240 ? "4h" : `${m}m`}
            </button>
          ))}
        </div>
      </header>

      {trace.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {trace.isError && (
        <p className="text-sm text-red-500">
          Failed to load trace: {trace.error.message}
        </p>
      )}

      {trace.data && (
        <>
          <section
            data-testid="dispatch-totals"
            aria-label="Window totals"
            className="rounded-xl border border-border bg-card p-4 text-card-foreground"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Claimed" value={trace.data.totals.claimed} />
              <Stat label="Delivered" value={trace.data.totals.delivered} />
              <Stat label="Failed" value={trace.data.totals.failed} tone={trace.data.totals.failed > 0 ? "warn" : "neutral"} />
              <Stat label="Pending" value={trace.data.totals.pending} />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Since {new Date(trace.data.since).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" · "}
              {trace.data.minutes.length} active minute{trace.data.minutes.length === 1 ? "" : "s"}
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Minute (UTC)</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Claimed</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Delivered</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Failed</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Pending</th>
                    <th className="px-3 py-2 font-medium">Sample error</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.data.minutes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No dispatcher activity in the last {windowMin} minutes.
                      </td>
                    </tr>
                  )}
                  {trace.data.minutes.map((m) => (
                    <tr
                      key={m.minute}
                      className="border-t border-border align-top"
                    >
                      <td className="px-3 py-2 tabular-nums text-foreground">
                        {m.minute.slice(11, 16)}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {m.minute.slice(0, 10)}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{m.claimed}</td>
                      <td className="px-3 py-2 tabular-nums">{m.delivered}</td>
                      <td className={"px-3 py-2 tabular-nums " + (m.failed > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {m.failed}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{m.pending}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {m.sampleError ? (
                          <span title={m.sampleError} className="line-clamp-2 break-words">
                            {m.sampleError.length > 120 ? m.sampleError.slice(0, 120) + "…" : m.sampleError}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground">
            Note: collisions and scanned-but-not-matched specs aren&apos;t recoverable
            from digest_runs alone (the unique index swallows them). If you see consecutive
            minutes with zero claimed but active briefs exist, check Inngest function logs.
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "neutral" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={"text-xl font-medium tabular-nums " + (tone === "warn" ? "text-foreground" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
