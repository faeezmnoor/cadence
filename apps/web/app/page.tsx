import { Send, MessageCircle } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { IcpStripes } from "@/components/marketing/icp-stripes";
import { SampleBrief } from "@/components/marketing/sample-brief";

/**
 * Landing page. Position: your own researcher, delivering a daily sourced
 * brief in whichever messaging app you already use — and it learns from
 * your feedback. Copy reflects the future-state product (multi-channel)
 * rather than today's MVP (Telegram-only). See feedback_cadence_positioning
 * memory. Copy v3 (2026-06-10): second-person hero, explicit learning
 * mechanic, proof (sample brief) above the claims cards.
 */
export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <MarketingNav />

      <section className="flex flex-col items-center px-6 pb-16 pt-10 sm:pt-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Your own researcher, reporting in every morning
          </span>

          <h1 className="text-balance font-serif text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Wake up knowing what changed.
          </h1>

          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Tell Cadence what to watch — a commodity, a competitor, a new
            regulation. Every morning, a short, sourced brief lands in the
            messaging app you already use. Tell it what to change, and the
            next one comes back better. By week two, it reads like it was
            written for you.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="/auth/sign-in"
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Start your first brief
            </a>
            <p className="text-xs text-muted-foreground">
              Start free — 3 briefs, no card.
            </p>
          </div>

          {/* Channel row: Telegram live, the rest on the way. Icons over
              words — the channel stays subordinate to the product. */}
          <div className="mt-6 flex items-center gap-5 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Send className="h-4 w-4" aria-hidden />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[11px] font-medium">Live</span>
            </span>
            <span className="flex items-center gap-3 opacity-35" aria-label="WhatsApp coming next">
              <MessageCircle className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-[11px] text-muted-foreground/70">Next</span>
          </div>
        </div>

        {/* Proof before claims: the sample brief is the page's only
            demonstration of judgment — it goes above the cards. */}
        <div className="mt-14 w-full">
          <SampleBrief />
        </div>

        <div className="mx-auto max-w-2xl">
          <ul className="mt-14 grid grid-cols-1 gap-4 text-left sm:grid-cols-3 sm:gap-6">
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Watch anything, however specific</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Halal poultry in Klang Valley. A competitor&apos;s pricing. New
                tax rules. You choose.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Where you already chat</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Nothing to install, nothing to check. The brief arrives like
                any other message.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">It learns from you</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap 👍 or 👎, or say what to change. The next brief remembers.
              </p>
            </li>
          </ul>
        </div>

        {/* PR 3 (§8.4): three ICP stripes deep-linking into a pre-seeded
            chat — the bridge between "watch anything" and a concrete start. */}
        <div className="mt-14 w-full">
          <IcpStripes />
        </div>

        <div className="mt-12 w-full max-w-3xl">
          <TrustStrip />
        </div>

        <div className="mt-12 flex flex-col items-center gap-2">
          <a
            href="/auth/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Start your first brief
          </a>
          <p className="text-xs text-muted-foreground">
            Start free — 3 briefs, no card. Credits never expire.
          </p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
