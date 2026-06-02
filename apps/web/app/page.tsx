import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Landing page. One screen, one CTA: "Get your daily brief". Mobile-first.
 *
 * Phase 1 wedge framing: this page sells a single concrete value-prop —
 * a personalised market brief in Telegram. No feature laundry list.
 */
export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <p className="text-sm font-medium tracking-tight">Cadence</p>
        <ThemeToggle />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-10 sm:pt-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Daily briefs over Telegram
          </span>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Your industry, briefed every morning.
          </h1>

          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Tell Cadence what to watch. It learns what you care about and delivers a
            sharp, personal market brief — in the messaging app you already check.
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
            {" "}— ex-Head of Product at respond.io.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="/auth/sign-in"
              className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Get your daily brief
            </a>
            <p className="text-xs text-muted-foreground">
              Free during beta. No card required.
            </p>
          </div>

          <ul className="mt-12 grid grid-cols-1 gap-4 text-left sm:grid-cols-3 sm:gap-6">
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Pick any industry</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Palm oil. Semis. Live commerce. Tell us once.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Delivered on Telegram</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No new app to check. Right where you already are.
              </p>
            </li>
            <li className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Learns from you</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Thumbs and tunes shape tomorrow&apos;s brief.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        Built in Kuala Lumpur. Currently in private beta.
      </footer>
    </main>
  );
}
