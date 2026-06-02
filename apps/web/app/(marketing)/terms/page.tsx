import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms — Cadence",
  description:
    "The deal between you and Cadence. Plain language, founder-voiced. No subscription, pre-paid credits, no warranty on market accuracy.",
};

const updated = "2 June 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-[15px] leading-relaxed">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Terms</h1>
        <p className="mt-2 text-xs text-muted-foreground">Last updated: {updated}</p>
      </header>

      <p className="text-muted-foreground">
        These are the terms between you and Cadence. They are short on purpose.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">What you get</h2>
        <p className="text-muted-foreground">
          Cadence composes and delivers periodical market-research briefs to the
          messaging app you connect, based on the spec you configure. Telegram is
          live today; WhatsApp and other channels are on the roadmap. You can pause,
          change, or stop briefs at any time from the chat.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Credits, not subscriptions</h2>
        <p className="text-muted-foreground">
          Cadence is sold as pre-paid credit packs. One brief = one credit. Credits do
          not expire. You may request a refund of unused credits within 14 days of
          purchase by emailing{" "}
          <a className="underline-offset-2 hover:underline" href="mailto:support@cadence.news">support@cadence.news</a>.
          We grant 3 free credits on signup; those are not refundable for cash.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">No financial advice</h2>
        <p className="text-muted-foreground">
          Cadence briefs are research summaries, not financial advice. We cite our
          sources but we do not guarantee accuracy, completeness, or fitness for any
          trading decision. Read the underlying sources before you act on a number.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Acceptable use</h2>
        <p className="text-muted-foreground">
          Don&apos;t use Cadence to harass, defraud, or attack anyone. Don&apos;t resell
          briefs as your own product. Don&apos;t try to extract our prompts or models. We
          can suspend accounts that do these things.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Outages and changes</h2>
        <p className="text-muted-foreground">
          We aim to deliver every brief on time. If we miss a delivery because of an
          outage on our side, the credit is returned. Cadence is an evolving product;
          we may change features, prompts, and pack sizes. We&apos;ll email you before any
          change that materially worsens what you bought.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Liability</h2>
        <p className="text-muted-foreground">
          Cadence is provided as-is. To the extent the law allows, our maximum liability
          to you is the amount you paid us in the last 12 months.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Jurisdiction</h2>
        <p className="text-muted-foreground">
          These terms are governed by the laws of Malaysia. Application data is stored
          in Supabase&apos;s Singapore region.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Questions? <a className="underline-offset-2 hover:underline" href="mailto:support@cadence.news">support@cadence.news</a>.
      </p>
    </article>
  );
}
