import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — Cadence",
  description:
    "Pre-paid credit packs from $5 to $100. Three free briefs on signup. No subscription, no surprises.",
};

type Pack = {
  name: string;
  price: string;
  briefs: string;
  blurb: string;
  popular?: boolean;
};

const packs: Pack[] = [
  { name: "Taste", price: "$5", briefs: "~15 briefs", blurb: "Try it for two weeks before you commit." },
  { name: "Habit", price: "$10", briefs: "~35 briefs", blurb: "About a month of daily briefs.", popular: true },
  { name: "Operator", price: "$25", briefs: "~90 briefs", blurb: "A full quarter, comfortably." },
  { name: "Year", price: "$100", briefs: "~400 briefs", blurb: "Roughly a year of daily briefs." },
];

/**
 * Pricing page. Four pre-paid packs + 3-free-briefs trial. Plain language, no fake urgency.
 * USD today; MYR localization rolls out once Stripe MY KYC clears.
 */
export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-12 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          $5 to taste. $100 if you love it.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          No subscription. Pre-pay for briefs, use them at your own pace. Three free
          briefs on signup so you can see the quality before you spend a ringgit.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Prices in USD. MYR rolling out for Malaysian customers shortly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packs.map((pack) => (
          <div
            key={pack.name}
            className={
              pack.popular
                ? "relative flex flex-col rounded-xl border-2 border-brand bg-card p-6 shadow-sm"
                : "flex flex-col rounded-xl border border-border bg-card p-6"
            }
          >
            {pack.popular ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-foreground">
                Most popular
              </span>
            ) : null}
            <p className="text-sm font-medium text-muted-foreground">{pack.name}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{pack.price}</p>
            <p className="mt-1 text-xs text-muted-foreground">{pack.briefs}</p>
            <p className="mt-4 text-sm text-foreground/80">{pack.blurb}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 rounded-xl border border-border bg-card/40 p-6 sm:grid-cols-3">
        <div>
          <p className="text-sm font-medium">3 free briefs to start</p>
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

      <div className="mt-12 text-center">
        <Link
          href="/auth/sign-in"
          className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Claim your 3 free briefs
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">No card to start.</p>
      </div>
    </div>
  );
}
