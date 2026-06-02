import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Cadence",
  description:
    "What Cadence collects, how we use LLMs, how we deliver briefs to your messaging app, and how to delete your data. Plain language, founder-voiced.",
};

const updated = "2 June 2026";

/**
 * Founder-voiced one-pager. Required for Stripe MY KYC. Plain English on purpose —
 * the moment this reads like a lawyer wrote it, trust drops.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 text-[15px] leading-relaxed">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy</h1>
        <p className="mt-2 text-xs text-muted-foreground">Last updated: {updated}</p>
      </header>

      <p className="text-muted-foreground">
        Hi, I&apos;m Faeez, the person running Cadence. This page is the founder-voiced
        version of our privacy policy. It is the actual policy &mdash; not a friendlier
        summary of something stricter buried elsewhere.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">What we collect</h2>
        <p className="text-muted-foreground">
          Your email, your Google account ID (if you sign in with Google), the Telegram
          chat ID we send your briefs to, your spec (the description of what you want
          briefed), your feedback (thumbs and tunes), and the briefs we&apos;ve sent you.
          That&apos;s it. We do not collect anything you did not give us.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">How LLMs use your data</h2>
        <p className="text-muted-foreground">
          To compose your brief we send your spec, your recent feedback, and live news
          signals to large language models (today: Anthropic Claude and OpenAI). We send
          them what they need to write your brief and nothing else. We do not opt your
          data into model training; the providers we use process it under their
          enterprise terms only.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Messaging delivery</h2>
        <p className="text-muted-foreground">
          Cadence delivers briefs to the messaging app you connect. Today that is
          Telegram (via the Telegram Bot API); WhatsApp and other channels are on the
          roadmap. The provider you choose stores the message under their own terms.
          We do not broadcast your brief to anyone else.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Data retention</h2>
        <p className="text-muted-foreground">
          Briefs and feedback are retained while your account is active so the system
          can keep learning. If you delete your account we remove your spec, feedback,
          and brief history within 30 days. Aggregate, anonymous metrics (e.g. &ldquo;how
          many briefs were delivered last month&rdquo;) may persist indefinitely.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Deletion requests</h2>
        <p className="text-muted-foreground">
          Email <a className="underline-offset-2 hover:underline" href="mailto:support@cadence.news">support@cadence.news</a>{" "}
          from the address on file and we&apos;ll delete everything within 30 days. No
          forms, no rituals.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Jurisdiction</h2>
        <p className="text-muted-foreground">
          Cadence is operated from Kuala Lumpur, Malaysia. Application data is stored in
          Supabase&apos;s Singapore region. Disputes are governed by the laws of Malaysia.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Changes</h2>
        <p className="text-muted-foreground">
          If this policy changes in a way that affects you, we&apos;ll email you before the
          change takes effect.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Questions? <a className="underline-offset-2 hover:underline" href="mailto:support@cadence.news">support@cadence.news</a>.
      </p>
    </article>
  );
}
