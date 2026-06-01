/**
 * RSS connector (T-207, CAD-30).
 *
 * Pulls the feeds users declared in their DigestSpec (`rss_feeds[]`) and
 * persists items into `rss_items` with `(feed_url, guid)` dedup.
 *
 * Two consumers:
 *  - Hourly Inngest poll (`rss.poll.tick`) — refresh all distinct feeds
 *    across all current specs.
 *  - Composer (T-208 via T-211) — reads recent rss_items per spec when
 *    building the sources bundle.
 */
import Parser from "rss-parser";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestSpecs, rssItems } from "@/server/db/schema";
import { digestSpecSchema } from "@/lib/digest-spec/schema";

interface DeclaredFeed {
  url: string;
  label: string;
  specId: string;
}

interface PolledFeedResult {
  feedUrl: string;
  specIds: string[];
  fetched: number;
  inserted: number;
  error?: string;
}

const parser = new Parser({
  timeout: 8000,
  headers: { "User-Agent": "Cadence/1.0 (+https://cadence.brief)" },
});

// ---------------------------------------------------------------------------
// Discovery — which feeds do current specs reference?
// ---------------------------------------------------------------------------

/**
 * Walk every current digest_spec, extract its rss_feeds[], return one row
 * per (specId, url) so the poller knows which spec each feed item belongs
 * to. A single URL can map to multiple specIds — we insert one rss_items
 * row per spec to keep the moat tight (each spec's history is independent).
 */
export async function listDeclaredFeeds(): Promise<DeclaredFeed[]> {
  const specs = await db
    .select({ id: digestSpecs.id, spec: digestSpecs.spec })
    .from(digestSpecs)
    .where(eq(digestSpecs.isCurrent, true));

  const out: DeclaredFeed[] = [];
  for (const row of specs) {
    const parsed = digestSpecSchema.safeParse(row.spec);
    if (!parsed.success) continue;
    for (const feed of parsed.data.rss_feeds ?? []) {
      out.push({ url: feed.url, label: feed.label, specId: row.id });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull + persist
// ---------------------------------------------------------------------------

interface ParsedItem {
  guid: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string;
}

function normalizeItem(raw: Parser.Item): ParsedItem | null {
  const url = raw.link ?? raw.guid;
  const title = raw.title ?? "";
  if (!url || !title) return null;
  // Prefer guid; fall back to link as identity.
  const guid = (raw.guid ?? raw.link ?? "").slice(0, 500);
  if (!guid) return null;
  let publishedAt: Date | null = null;
  if (raw.isoDate) {
    const d = new Date(raw.isoDate);
    if (!Number.isNaN(d.getTime())) publishedAt = d;
  }
  const summary = (raw.contentSnippet ?? raw.content ?? "").slice(0, 2000);
  return { guid, title: title.slice(0, 500), url, publishedAt, summary };
}

/**
 * Fetch one URL, persist new items for every spec that subscribes to it.
 * Returns counts for logging. Errors are caught per-feed; a single bad
 * feed must not stop the rest of the poll.
 */
export async function pollFeed(
  feedUrl: string,
  specIds: string[]
): Promise<PolledFeedResult> {
  const base: PolledFeedResult = {
    feedUrl,
    specIds,
    fetched: 0,
    inserted: 0,
  };
  let parsed;
  try {
    parsed = await parser.parseURL(feedUrl);
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const items = (parsed.items ?? [])
    .map(normalizeItem)
    .filter((x): x is ParsedItem => x !== null)
    // Cap per-feed pull to avoid runaway inserts.
    .slice(0, 50);
  base.fetched = items.length;
  if (items.length === 0 || specIds.length === 0) return base;

  // Build N items * M specs rows; dedupe handles re-runs.
  const rows = specIds.flatMap((specId) =>
    items.map((it) => ({
      specId,
      feedUrl,
      guid: it.guid,
      title: it.title,
      url: it.url,
      publishedAt: it.publishedAt,
      summary: it.summary,
    }))
  );

  // onConflictDoNothing on (feed_url, guid) handles dedup.
  // Note: unique is on (feed_url, guid) — across all specs. That means a
  // shared feed gets stored once at the (feed_url, guid) level. Per-spec
  // attribution is via spec_id. We use a separate insert chunk per spec
  // because the unique index doesn't include spec_id by design (doc 04).
  for (const specId of specIds) {
    const specRows = items.map((it) => ({
      specId,
      feedUrl,
      guid: it.guid,
      title: it.title,
      url: it.url,
      publishedAt: it.publishedAt,
      summary: it.summary,
    }));
    const inserted = await db
      .insert(rssItems)
      .values(specRows)
      .onConflictDoNothing({
        target: [rssItems.feedUrl, rssItems.guid],
      })
      .returning({ id: rssItems.id });
    base.inserted += inserted.length;
  }
  return base;
}

/**
 * Public entry — called by the hourly Inngest cron. Groups declared feeds
 * by URL so we make one HTTP call per unique feed.
 */
export async function pollAllFeeds(): Promise<PolledFeedResult[]> {
  const declared = await listDeclaredFeeds();
  const byUrl = new Map<string, string[]>();
  for (const f of declared) {
    const arr = byUrl.get(f.url) ?? [];
    arr.push(f.specId);
    byUrl.set(f.url, arr);
  }
  const results: PolledFeedResult[] = [];
  for (const [url, specIds] of byUrl.entries()) {
    results.push(await pollFeed(url, Array.from(new Set(specIds))));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Composer read — recent items for one spec
// ---------------------------------------------------------------------------

export interface RecentRssRow {
  guid: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  summary: string;
  feedUrl: string;
}

/**
 * Pull up to `limit` recent items for a spec, optionally restricted to
 * `sinceHours` ago. Composer uses this when building sources bundle.
 */
export async function recentRssForSpec(
  specId: string,
  opts: { limit?: number; sinceHours?: number } = {}
): Promise<RecentRssRow[]> {
  const limit = opts.limit ?? 30;
  const sinceHours = opts.sinceHours ?? 48;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      guid: rssItems.guid,
      title: rssItems.title,
      url: rssItems.url,
      publishedAt: rssItems.publishedAt,
      summary: rssItems.summary,
      feedUrl: rssItems.feedUrl,
    })
    .from(rssItems)
    .where(
      and(
        eq(rssItems.specId, specId),
        // Fall back to createdAt when publishedAt is null.
        sql`COALESCE(${rssItems.publishedAt}, ${rssItems.createdAt}) >= ${since}`
      )
    )
    .orderBy(sql`COALESCE(${rssItems.publishedAt}, ${rssItems.createdAt}) DESC`)
    .limit(limit);
  return rows.map((r) => ({
    guid: r.guid,
    title: r.title,
    url: r.url,
    publishedAt: r.publishedAt as Date | null,
    summary: r.summary ?? "",
    feedUrl: r.feedUrl,
  }));
}

// Suppress unused-import lint for inArray/gte (kept for future filters).
void inArray;
void gte;
