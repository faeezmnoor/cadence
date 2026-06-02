import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { TrustStrip } from "@/components/marketing/trust-strip";
import { SampleBrief } from "@/components/marketing/sample-brief";

/**
 * Landing page. Position: a senior market researcher at a fraction of the cost,
 * delivering daily briefs in whichever messaging app you already use.
 * Copy reflects the future-state product (multi-channel) rather than today's
 * MVP (Telegram-only). See feedback_cadence_positioning memory.
 */
export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <MarketingNav />

      <section className="flex flex-col items-center px-6 pb-16 pt-10 sm:pt-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            A senior researcher for your industry — daily
          </span>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Your industry has a researcher now. For the price of coffee.
          </h1>

          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Tell Cadence what to watch. Every morning, a sharp, sourced briefing
            arrives in the messaging app you already use. By week two, it sounds
            like it was written for you.
          </p>

          <p className="mt-4 text-xs text-muted-foreground">
            Built by{" "}
            <a
              href="https://www.linkedin.com/in/faeezmnoor/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Faeez Noor
            </a>
            {" "}&mdash; ex-Head of Product at respond.io.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="/auth/sign-in"
              className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Get your daily brief
            </a>
            <p className="text-xs text-muted-foreground">
              3 free briefs. No card to start.
            </p>
          </div>

          <p className="mt-4 text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Live on Telegram today · WhatsApp &amp; more on the way
          </p>

          <ul className="mt-12 grid grid-cols-1 gap-4 text-left sm:grid-cols-3 sm:gap-6">
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Any industry, however narrow</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Halal poultry in Klang Valley. AI infra capex. Your call.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Wherever you already chat</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No new app to install, no inbox to triage. The brief comes to you.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Sharpens every week</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Thumbs and tunes shape tomorrow&apos;s brief. By week 2 it&apos;s yours.
              </p>
            </li>
          </ul>
        </div>

        <div className="mt-16 w-full">
          <SampleBrief />
        </div>

        <div className="mt-12 w-full max-w-3xl">
          <TrustStrip />
        </div>

        <div className="mt-12 flex flex-col items-center gap-3">
          <a
            href="/auth/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Try it on your industry
          </a>
          <p className="text-xs text-muted-foreground">
            3 free briefs. No card to start.
          </p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
