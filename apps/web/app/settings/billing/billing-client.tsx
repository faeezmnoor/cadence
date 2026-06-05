"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { PACKS, PACK_LABELS, type PackId } from "@/server/billing/packs";
import { SUPPORT_EMAIL } from "@/server/support/contact";
import { TierExplainer } from "@/components/billing/tier-explainer";

function formatUsd(minor: number) {
  return `$${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}`;
}

function formatMyr(minor: number) {
  return `RM ${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}`;
}

function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function txLabel(type: string) {
  if (type === "trial_grant") return "Trial credit grant";
  if (type === "message_send") return "Brief delivered";
  if (type === "charge") return "Brief delivered";
  if (type === "topup") return "Top-up";
  if (type === "adjustment") return "Adjustment";
  if (type === "refund") return "Refund credited";
  return type;
}

/**
 * CAD-89: render the 🔬 Pro tier badge next to charge / refund rows where
 * the underlying metadata.tier === "pro". Pulls from the snapshot we
 * stamped onto the transaction at debit / refund time.
 */
function tierBadge(metadata: unknown): React.ReactNode {
  if (!metadata || typeof metadata !== "object") return null;
  const tier = (metadata as { tier?: string }).tier;
  if (tier !== "pro") return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
      🔬 Pro
    </span>
  );
}

export function BillingClient() {
  const balance = trpc.billing.getBalance.useQuery();
  const ledger = trpc.billing.getLedger.useQuery();

  return (
    <div className="space-y-10">
      {/* Balance card */}
      <section className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Current balance
        </p>
        <p className="mt-2 text-4xl font-semibold tabular-nums">
          {balance.isLoading ? "—" : balance.data?.creditsBalance ?? 0}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            credit{(balance.data?.creditsBalance ?? 0) === 1 ? "" : "s"}
          </span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          One credit, one brief landed in your inbox. Credits never expire.
        </p>
      </section>

      {/* Pack tiles (disabled top-up) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Top up</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PACKS.map((p) => (
            <article
              key={p.packId}
              className={`relative rounded-lg border bg-card p-4 ${
                p.highlight === "best_value"
                  ? "border-brand"
                  : "border-border"
              }`}
            >
              {p.highlight === "best_value" && (
                <span className="absolute right-3 top-3 rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-brand-foreground">
                  Best value
                </span>
              )}
              <p className="text-sm font-medium">{PACK_LABELS[p.packId as PackId]}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {p.credits}
              </p>
              <p className="text-xs text-muted-foreground">credits</p>
              <p className="mt-3 text-sm">
                {formatUsd(p.priceMinorUsd)}{" "}
                <span className="text-xs text-muted-foreground">
                  / {formatMyr(p.priceMinorMyr)}
                </span>
              </p>
              <button
                type="button"
                disabled
                title="Top-ups arrive when Stripe MY clears KYC"
                className="mt-3 inline-flex h-8 w-full cursor-not-allowed items-center justify-center rounded-md border border-border bg-muted px-3 text-xs font-medium text-muted-foreground"
              >
                Top up — coming soon
              </button>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Top-ups land when Stripe MY clears KYC. Until then, email{" "}
          <a className="underline-offset-2 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          to request a manual credit grant.
        </p>

        {/* CAD-95: tier explainer disclosure. Native <details> keeps this
            keyboard-accessible without a Dialog primitive — opens inline,
            doesn't trap focus, doesn't need an Escape handler. */}
        <details className="mt-6 rounded-lg border border-border bg-card/40 p-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-foreground">
            <span>What&apos;s the difference between Default and Pro briefs?</span>
            <span
              aria-hidden
              className="ml-3 text-xs text-muted-foreground transition group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="mt-4">
            <TierExplainer />
          </div>
        </details>
      </section>

      {/* Ledger */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">History</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {ledger.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : !ledger.data || ledger.data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nothing spent yet. First brief lands tomorrow at 07:00 MYT.
            </p>
          ) : (
            <>
              {/* Mobile: stacked card rows. The 4-col table overflows
                  horizontally at 390px even with horizontal scroll, so on
                  small screens we render each transaction as a 2-row card. */}
              <ul className="divide-y divide-border sm:hidden">
                {ledger.data.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium">
                        {txLabel(row.type)}
                        {tierBadge(row.metadata)}
                      </p>
                      <span
                        className={`text-sm tabular-nums ${
                          row.creditsDelta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : row.creditsDelta < 0
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }`}
                      >
                        {row.creditsDelta > 0 ? "+" : ""}
                        {row.creditsDelta}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(row.createdAt)}</span>
                      <span className="tabular-nums">
                        Balance {row.balanceAfter}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop/tablet: full table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 text-right font-medium">Change</th>
                      <th className="px-4 py-3 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.data.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {txLabel(row.type)}
                          {tierBadge(row.metadata)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            row.creditsDelta > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : row.creditsDelta < 0
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {row.creditsDelta > 0 ? "+" : ""}
                          {row.creditsDelta}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.balanceAfter}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
