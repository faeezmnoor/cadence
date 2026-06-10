import type { Metadata } from "next";
import Link from "next/link";
import {
  PACKS,
  PACK_LABELS,
  TRIAL_CREDITS,
  type Pack,
} from "@/server/billing/packs";
import { TierExplainer } from "@/components/billing/tier-explainer";

export const metadata: Metadata = {
  title: "Pricing — Cadence",
  description:
    "Pre-paid credit packs. Three free briefs on signup. No subscription, no surprises.",
};

/**
 * QA P1 #3: pricing is rendered from the same PACKS constant the product
 * (and Stripe) uses, so marketing copy can never drift from the actual
 * ladder. Previously this file hard-coded a different ladder (15/35/90/400
 * briefs at 5/10/35/100) and would have shipped a trust-breaking mismatch
 * the moment a user signed in.
 */

function formatUsd(minorUsd: number): string {
  const dollars = minorUsd / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

function blurbFor(packId: Pack["packId"], credits: number): string {
  // Hand-tuned framing so the cards still read like marketing copy rather
  // than an admin table. Update here if the ladder shifts; the credit
  // counts come from the canonical PACKS constant.
  switch (packId) {
    case "taste":
      return `Try ${credits} briefs before you commit to a real cadence.`;
    case "standard":
      return `About two months of daily briefs.`;
    case "power":
      return `Heavy daily use for the better part of a year.`;
    case "pro":
      return `Multi-channel cover for a busy desk. ${credits} briefs.`;
  }
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-12 text-center">
        <h1 className="text-balance font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatUsd(PACKS[0]!.priceMinorUsd)} to taste.{" "}
          {formatUsd(PACKS[PACKS.length - 1]!.priceMinorUsd)} if you love it.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          No subscription. Pre-pay for briefs, use them at your own pace.{" "}
          {TRIAL_CREDITS} free briefs on signup so you can see the quality
          before you spend a ringgit.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Prices in USD. MYR rolling out for Malaysian customers shortly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PACKS.map((pack) => {
          const popular = pack.highlight === "best_value";
          return (
            <div
              key={pack.packId}
              className={
                popular
                  ? "relative flex flex-col rounded-xl border-2 border-brand bg-card p-6 shadow-sm"
                  : "flex flex-col rounded-xl border border-border bg-card p-6"
              }
            >
              {popular ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-foreground">
                  Best value
                </span>
              ) : null}
              <p className="text-sm font-medium text-muted-foreground">
                {PACK_LABELS[pack.packId]}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {formatUsd(pack.priceMinorUsd)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pack.credits} briefs
              </p>
              <p className="mt-4 text-sm text-foreground/80">
                {blurbFor(pack.packId, pack.credits)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 rounded-xl border border-border bg-card/40 p-6 sm:grid-cols-3">
        <div>
          <p className="text-sm font-medium">{TRIAL_CREDITS} free briefs to start</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Granted on signup. No card required. If you don&apos;t like the briefs, you
            walk.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Credits never expire</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Skip a week, skip a month. Your credits wait. One brief = one credit.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Cancel by stopping</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No subscription means nothing to cancel. Use what you bought, stop when
            you&apos;re done.
          </p>
        </div>
      </div>

      {/* CAD-202: research-depth breakdown. Lives below the pack tiles +
          trust strip so the pricing ladder leads the page; research depth
          is a per-brief configuration toggle, not a plan tier. */}
      <section className="mt-14 rounded-xl border border-border bg-card/40 p-6">
        <h2 className="text-balance text-xl font-semibold tracking-tight">
          Pick a research depth per brief. Same shape, different intensity.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every brief defaults to standard research. Switch to advanced research on the briefs that deserve deeper analysis — you only spend the extra credits where you point them.
        </p>
        <div className="mt-6">
          <TierExplainer />
        </div>
      </section>

      <div className="mt-12 text-center">
        <Link
          href="/auth/sign-in"
          className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Claim your {TRIAL_CREDITS} free briefs
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">No card to start.</p>
      </div>
    </div>
  );
}
