import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs } from "@/server/db/schema";
import { isValidShortId } from "@/server/digest/share";
import { Wordmark } from "@/components/marketing/wordmark";

/**
 * Stream E #6 — public per-brief permalink (PM audit G6).
 *
 * Route: /b/<short_id> — no auth required, briefs are sharable artifacts.
 *
 * TODO(stream-a): once Stream A's composer merges, it will append a
 * "Read this on the web · share it →" line to the Telegram footer of
 * every delivered brief, pointing at this URL. The helper to use is
 * `getBriefShareUrl(shortId)` in `server/digest/share.ts`. Do NOT modify
 * the composer from this stream — Stream A owns prompts/ and composer/.
 *
 * Caching: briefs are immutable post-send, so we can cache for a long
 * time. `force-static` revalidate=1d is a sane default; if a brief is
 * deleted by account closure, the page just 404s afterwards.
 */
export const revalidate = 86400;

type PageProps = {
  params: Promise<{ shortId: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { shortId } = await params;
  return {
    title: `Brief · ${shortId} · Cadence`,
    description:
      "A daily research brief tuned by Cadence — a senior market researcher delivered to your favourite messaging app.",
    openGraph: {
      title: "Daily research brief — Cadence",
      description:
        "Tuned for one operator. Delivered every morning. Get your own.",
    },
    robots: {
      // Briefs are public but we don't want all of them indexed; possession
      // of the link is the share unit.
      index: false,
      follow: false,
    },
  };
}

export default async function BriefByShortIdPage({ params }: PageProps) {
  const { shortId } = await params;
  if (!isValidShortId(shortId)) notFound();

  const rows = await db
    .select({
      id: digestRuns.id,
      shortId: digestRuns.shortId,
      status: digestRuns.status,
      runDate: digestRuns.runDate,
      composedMarkdown: digestRuns.composedMarkdown,
      createdAt: digestRuns.createdAt,
      specJson: digestSpecs.spec,
    })
    .from(digestRuns)
    .innerJoin(digestSpecs, eq(digestRuns.specId, digestSpecs.id))
    .where(eq(digestRuns.shortId, shortId))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();
  if (row.status !== "delivered" && row.status !== "sent") notFound();
  if (!row.composedMarkdown) notFound();

  const spec = (row.specJson ?? {}) as Record<string, unknown>;
  const topics = Array.isArray((spec as { topics?: unknown[] }).topics)
    ? ((spec as { topics: unknown[] }).topics.filter(
        (t): t is string => typeof t === "string"
      ) as string[])
    : [];

  const runDateStr = new Date(row.runDate).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Cadence — home">
            <Wordmark asLink={false} className="text-sm" />
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get your own
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <article>
          <header className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Daily research brief
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {runDateStr}
            </h1>
            {topics.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {topics.join(" · ")}
              </p>
            )}
          </header>

          {/* Brief body — server-rendered markdown via react-markdown so
              [Source](url) links are clickable instead of literal text
              (QA P2 #1: defeats the "share it" CTA otherwise). All links
              open in a new tab with rel="noopener noreferrer". Styles
              applied via component overrides — no @tailwindcss/typography
              dependency. */}
          <div
            data-testid="brief-body"
            className="break-words rounded-xl border border-border bg-card p-6 text-[14px] leading-relaxed"
          >
            <ReactMarkdown
              components={{
                a: ({ children, href, ...props }) => (
                  <a
                    {...props}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-2 hover:opacity-80"
                  >
                    {children}
                  </a>
                ),
                h1: ({ children }) => (
                  <h2 className="mb-3 mt-6 text-xl font-semibold tracking-tight first:mt-0">
                    {children}
                  </h2>
                ),
                h2: ({ children }) => (
                  <h3 className="mb-2 mt-5 text-lg font-semibold tracking-tight first:mt-0">
                    {children}
                  </h3>
                ),
                h3: ({ children }) => (
                  <h4 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0">
                    {children}
                  </h4>
                ),
                p: ({ children }) => (
                  <p className="my-3 first:mt-0 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => (
                  <strong className="font-semibold">{children}</strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,
                hr: () => <hr className="my-6 border-border" />,
                blockquote: ({ children }) => (
                  <blockquote className="my-3 border-l-2 border-border pl-3 italic text-muted-foreground">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">
                    {children}
                  </code>
                ),
              }}
            >
              {row.composedMarkdown}
            </ReactMarkdown>
          </div>
        </article>

        <footer className="mt-12 border-t border-border pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            A senior market researcher in your inbox &mdash; for the price of
            coffee.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:opacity-90"
          >
            Get your own daily brief
          </Link>
          <p className="mt-6 text-xs text-muted-foreground">
            Cadence &mdash; cadence-web-bice.vercel.app
          </p>
        </footer>
      </main>
    </div>
  );
}
