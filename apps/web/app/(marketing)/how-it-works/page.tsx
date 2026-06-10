import type { Metadata } from "next";
import Link from "next/link";
import { SampleBrief } from "@/components/marketing/sample-brief";

export const metadata: Metadata = {
  title: "How it works — Cadence",
  description:
    "Tell Cadence what to watch. A short, sourced brief every morning — and it learns from your corrections.",
};

const steps = [
  {
    n: "1",
    title: "Tell Cadence what to watch",
    body: "Open the chat on web and describe your industry, your language, and what you care about. Palm oil prices and Bursa-listed plantation news in English? Halal F&B trends in Klang Valley in Malay? New tax rulings that affect your clients, in Chinese? Say it once.",
  },
  {
    n: "2",
    title: "It researches and writes — every morning",
    body: "Every day before your delivery time, Cadence pulls fresh signals, drafts a brief in your language, fact-checks against sources, and sends it to the messaging app you chose. One message. Sources cited inline. Done before your first coffee. (Telegram today, WhatsApp next.)",
  },
  {
    n: "3",
    title: "You react — it learns",
    body: "Tap 👍 / 👎, or tell it what to change — \"less Indonesia, more Felda earnings.\" Every correction sticks. By week two the brief reads like it was written for you — because it was.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-12 text-center">
        <h1 className="text-balance font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Three steps. Then it just shows up.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          Cadence is your own researcher. Tell it what to watch once — a short,
          sourced brief arrives every morning after that.
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
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold tracking-tight">Day 1 vs day 10</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Same setup, ten days of corrections apart — here&apos;s day 10:
          </p>
        </div>
        <SampleBrief />
      </div>

      <div className="mt-14 text-center">
        <Link
          href="/auth/sign-in"
          className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:bg-brand hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Start your first brief
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">Start free — 3 briefs, no card.</p>
      </div>
    </div>
  );
}
