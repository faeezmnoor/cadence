/**
 * Hourly RSS poll (T-207).
 *
 * Cron: every hour on the hour. Walks every current DigestSpec, fetches
 * each declared feed once, and upserts new items into `rss_items`.
 *
 * Failures per-feed are isolated; one bad URL must not stop the rest.
 */
import { inngest } from "../client";
import { pollAllFeeds } from "@/server/connectors/rss";

export const rssPoll = inngest.createFunction(
  {
    id: "rss-poll",
    // Cap concurrency to one — no point parallelizing if all the work is
    // network-bound on shared feeds.
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const results = await step.run("poll-all-feeds", async () => {
      const out = await pollAllFeeds();
      return out.map((r) => ({
        feedUrl: r.feedUrl,
        specCount: r.specIds.length,
        fetched: r.fetched,
        inserted: r.inserted,
        error: r.error ?? null,
      }));
    });

    type ResultRow = (typeof results)[number];
    const totals = results.reduce(
      (acc: { feeds: number; fetched: number; inserted: number; errors: number }, r: ResultRow) => {
        acc.feeds += 1;
        acc.fetched += r.fetched;
        acc.inserted += r.inserted;
        if (r.error) acc.errors += 1;
        return acc;
      },
      { feeds: 0, fetched: 0, inserted: 0, errors: 0 }
    );

    return { ok: true, totals, results };
  }
);
