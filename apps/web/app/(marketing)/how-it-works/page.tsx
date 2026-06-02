import type { Metadata } from "next";
import Link from "next/link";
import { SampleBrief } from "@/components/marketing/sample-brief";

export const metadata: Metadata = {
  title: "How it works — Cadence",
  description:
    "Tell Cadence what to watch. We research and compose every morning. You give thumbs and tunes — it learns. Three steps, in plain language.",
};

const steps = [
  {
    n: "1",
    title: "Tell Cadence what to watch",
    body: "Open the chat on web and describe your industry, your language, and what you care about. Palm oil prices and Bursa-listed plantation news in English? Halal F&B trends in Klang Valley in Malay? Crypto + your watchlist in Chinese? Say it once.",
  },
  {
    n: "2",
    title: "Cadence researches and composes — every morning",
    body: "Every day before your delivery time, Cadence pulls fresh signals, drafts a brief in your language, fact-checks against sources, and sends it to the messaging app you chose. One message. Sources cited inline. Done before your first coffee. (Telegram is live today; WhatsApp and more on the way.)",
  },
  {
    n: "3",
    title: "You give thumbs and tunes — it learns",
    body: "Tap 👍 / 👎 or send a quick \"tune: less Indonesia, more Felda earnings.\" By week two the brief sounds like it was written for you, because it was — by an assistant that took your last 14 corrections seriously.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-12 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Three steps. Then it&apos;s on autopilot.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          Cadence is the bit of your morning between &ldquo;I should keep up with my industry&rdquo; and
          actually keeping up with your industry.
        </p>
      </div>

      <ol className="space-y-8">
        {steps.map((step) => (
          <li key={step.n} className="flex gap-5 rounded-xl border border-border bg-card p-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-base font-semibold text-brand-foreground">
              {step.n}
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-14">
        <p className="mb-4 text-center text-sm text-muted-foreground">
          Here&apos;s what one of those briefs looks like:
        </p>
        <SampleBrief />
      </div>

      <div className="mt-14 text-center">
        <Link
          href="/auth/sign-in"
          className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Start your first brief
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">3 free briefs. No card to start.</p>
      </div>
    </div>
  );
}
