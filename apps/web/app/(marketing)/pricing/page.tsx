import type { Metadata } from "next";
import Link from "next/link";
import {
  PACKS,
  PACK_LABELS,
  TRIAL_CREDITS,
  type Pack,
} from "@/server/billing/packs";
import { TierExplainer } from "@/components/billing/tier-explainer";
import { isProTierAlpha } from "@/lib/feature-flags";

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
      return `${credits} briefs — about a month of weekday mornings.`;
    case "standard":
      return `${credits} briefs — just over two months, daily.`;
    case "power":
      return `${credits} briefs — half a year daily, or a few briefs at once.`;
    case "pro":
      return `${credits.toLocaleString("en-US")} briefs — for several briefs a day, or a small team.`;
  }
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-12 text-center">
        <h1 className="text-balance font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatUsd(PACKS[0]!.priceMinorUsd)} to start. Pay only for briefs
          you get.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          No subscription. Buy credits, spend 1 per brief, at your own pace.{" "}
          {TRIAL_CREDITS} free briefs when you sign up — see the quality
          before you pay anything.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Prices in USD. MYR pricing for Malaysian customers is coming.
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
            Yours at sign-up, no card. If they&apos;re not useful, you&apos;ve spent
            nothing.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Credits never expire</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Skip a week or a month — your credits keep. 1 credit = 1 brief.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Nothing to cancel</p>
          <p className="mt-1 text-xs text-muted-foreground">
            There&apos;s no subscription. Use what you bought, stop whenever you
            like.
          </p>
        </div>
      </div>

      {/* CAD-202: research-depth breakdown. Lives below the pack tiles +
          trust strip so the pricing ladder leads the page; research depth
          is a per-brief configuration toggle, not a plan tier. */}
      <section className="mt-14 rounded-xl border border-border bg-card/40 p-6">
        <h2 className="text-balance text-xl font-semibold tracking-tight">
          Choose a research depth for each brief.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isProTierAlpha()
            ? "Every brief uses standard research unless you say otherwise. Switch on advanced research where it's worth more — it digs deeper and uses 3 or 5 credits, shown on each option."
            : "Every brief uses standard research — 1 credit each. Advanced research is temporarily unavailable while we improve it."}
        </p>
        {/* Design-review 2026-06-11 FINDING-002: while advanced research is
            paused, TierExplainer renders the same unavailability line the
            paragraph above already says — the sentence appeared twice in a
            row on the money page. Render the explainer only when it has the
            full comparison to add. */}
        {isProTierAlpha() && (
          <div className="mt-6">
            <TierExplainer />
          </div>
        )}
      </section>

      <div className="mt-12 text-center">
        <Link
          href="/auth/sign-in"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          Start free — {TRIAL_CREDITS} briefs, no card
        </Link>
        {/* CAD-212e: honest payments status — card checkout isn't live yet. */}
        <p className="mt-3 text-xs text-muted-foreground">
          Card payments are almost ready — early users get credits added by
          hand, usually within a day.
        </p>
      </div>
    </div>
  );
}
