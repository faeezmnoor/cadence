"use client";

import Link from "next/link";
import type { DailyRow, TopRunRow } from "./page";

/**
 * CAD-94 — /admin/cost renderer. Pure presentation: the server component
 * has already done the auth check + SQL aggregation, this just lays out
 * the four sections (breaker banner / today / 7-day rolling / top runs).
 *
 * "use client" only because we want clickable links and the eventual
 * possibility of adding a date-range picker without a page refactor.
 * Currently no useState/useEffect — keeps SSR fast and avoids hydration
 * mismatch on the numbers.
 */
function formatUsd(usd: number): string {
  // Costs are small (< $100/day typically) — show 2dp for readability.
  if (!Number.isFinite(usd)) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

interface CostClientProps {
  adminEmail: string;
  breaker: {
    ok: boolean;
    usdToday: number;
    capUsd: number;
    reason: string | null;
  };
  today: DailyRow;
  daily: DailyRow[];
  topRuns: TopRunRow[];
}

export function CostClient({
  adminEmail,
  breaker,
  today,
  daily,
  topRuns,
}: CostClientProps) {
  // Banner colour follows the breaker: amber if approaching cap (>=80%),
  // red if tripped, emerald if comfortably under. Threshold-based not
  // gradient so a quick glance is unambiguous.
  const usagePct = breaker.capUsd > 0 ? (breaker.usdToday / breaker.capUsd) * 100 : 0;
  const breakerCls = !breaker.ok
    ? "border-red-300 bg-red-50 text-red-900"
    : usagePct >= 80
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-300 bg-emerald-50 text-emerald-900";
  const breakerLabel = !breaker.ok
    ? "TRIPPED"
    : usagePct >= 80
      ? "NEAR CAP"
      : "OK";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Admin · Cost</h1>
        <p className="text-sm text-muted-foreground">
          Advanced-research burn rate · signed in as {adminEmail}
        </p>
      </header>

      {/* Breaker status banner */}
      <section
        aria-label="Advanced-research circuit breaker status"
        className={`rounded-md border px-4 py-3 ${breakerCls}`}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <div className="font-medium">
            Advanced-research cost breaker · {breakerLabel}
          </div>
          <div className="text-sm tabular-nums">
            {formatUsd(breaker.usdToday)} / {formatUsd(breaker.capUsd)} today (
            {usagePct.toFixed(0)}%)
          </div>
        </div>
        {breaker.reason ? (
          <p className="mt-1 text-xs">
            <span className="font-mono">{breaker.reason}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs opacity-80">
            Daily Pro spend is summed against{" "}
            <code className="font-mono">PRO_TIER_DAILY_USD_CAP</code>. New Pro
            briefs auto-downgrade to Default + refund when this trips.
          </p>
        )}
      </section>

      {/* Today: side-by-side default vs pro */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today ({today.day} UTC)
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Standard research
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(today.defaultUsd)}
            </p>
          </div>
          <div className="rounded-lg border border-brand/40 bg-brand/5 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              🔬 Advanced research
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUsd(today.proUsd)}
            </p>
          </div>
        </div>
      </section>

      {/* 7-day rolling */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Last 7 days (UTC)
        </h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Default</th>
                <th className="px-3 py-2 text-right font-medium">🔬 Pro</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {daily.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    No cost events in the last 7 days.
                  </td>
                </tr>
              ) : (
                daily.map((d) => (
                  <tr key={d.day}>
                    <td className="px-3 py-2 font-mono tabular-nums">{d.day}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(d.defaultUsd)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(d.proUsd)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatUsd(d.defaultUsd + d.proUsd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top 10 expensive runs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Top 10 most expensive runs (last 7 days)
        </h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When (UTC)</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {topRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    No runs with cost in the last 7 days.
                  </td>
                </tr>
              ) : (
                topRuns.map((r) => (
                  <tr key={r.runId}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {r.createdAt.replace("T", " ").replace("Z", "")}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.userEmail ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <TierBadge tier={r.tier} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {r.status}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatUsd(r.totalUsd)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/admin/runs/${r.runId}` as never}
                        className="text-blue-600 hover:underline"
                      >
                        {r.runId.slice(0, 8)}…
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function TierBadge({ tier }: { tier: "default" | "pro" | "unknown" }) {
  if (tier === "pro") {
    return (
      <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
        🔬 Pro
      </span>
    );
  }
  if (tier === "default") {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Default
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      —
    </span>
  );
}
