/**
 * RSS aggregator — Phase 6a Pattern C (CAD-113 #2).
 *
 * Pure function: takes a list of feed URLs, returns NormalizedSourceItem[]
 * across all of them.  Stateless — no DB writes, no dedup against history.
 * (The existing apps/web/server/connectors/rss.ts is the spec-bound,
 * DB-persistent path; this is the lightweight composer-time path.)
 *
 * Reliability contract:
 *  - Parallel fetch with `Promise.allSettled`
 *  - 5s per-feed timeout
 *  - One bad feed never breaks the rest — partial result is OK
 *  - Per-feed parser failures logged but swallowed
 *  - Caps each feed to its 20 newest items so a runaway giant feed (e.g.
 *    a year-old archive RSS) can't dominate the composer prompt
 */
import Parser from "rss-parser";
import { parseNormalizedItem, type NormalizedSourceItem } from "../types";
import { CURATED_FEEDS } from "./feeds";

const PER_FEED_TIMEOUT_MS = 5_000;
const MAX_ITEMS_PER_FEED = 20;

/**
 * CAD-221: freshness window for the curated/gnews composer-time path.
 * Mirrors the 48h cut the legacy spec-bound connector applies — without
 * it a slow week serves the composer week-old items as "news".
 */
export const RSS_FRESHNESS_WINDOW_MS = 48 * 60 * 60 * 1_000;

const parser = new Parser({
  timeout: PER_FEED_TIMEOUT_MS,
  headers: { "User-Agent": "Cadence/1.0 (+https://cadence.brief)" },
});

interface AggregateOptions {
  /** Override per-feed timeout (mostly for tests). */
  timeoutMs?: number;
  /** Inject parser for testing — defaults to module's rss-parser instance. */
  parserImpl?: Pick<Parser, "parseURL">;
  /**
   * CAD-221: explicit feed-URL → source_id mapping for feeds built at
   * call time (dynamic Google News entity feeds) that aren't in
   * CURATED_FEEDS. Takes precedence over the curated lookup.
   */
  sourceIdByUrl?: Readonly<Record<string, string>>;
}

/**
 * Look up the curated source_id for a given feed URL, falling back to the
 * URL hostname when the URL isn't in CURATED_FEEDS (caller passed a raw
 * RSS URL).
 */
function sourceIdForFeed(
  feedUrl: string,
  sourceIdByUrl?: Readonly<Record<string, string>>
): string {
  const mapped = sourceIdByUrl?.[feedUrl];
  if (mapped) return mapped;
  const known = CURATED_FEEDS.find((f) => f.url === feedUrl);
  if (known) return known.id;
  try {
    return `rss:${new URL(feedUrl).hostname}`;
  } catch {
    return "rss:unknown";
  }
}

/**
 * Aggregate `feedUrls` into a flat NormalizedSourceItem[]. Items are
 * returned newest-first across all feeds (best-effort: missing
 * publishedAt sorts last). Caller decides how to slice further.
 */
export async function aggregateRss(
  feedUrls: readonly string[],
  opts: AggregateOptions = {}
): Promise<NormalizedSourceItem[]> {
  if (feedUrls.length === 0) return [];
  const p = opts.parserImpl ?? parser;
  const timeoutMs = opts.timeoutMs ?? PER_FEED_TIMEOUT_MS;

  const settled = await Promise.allSettled(
    feedUrls.map((url) => fetchOne(url, p, timeoutMs, opts.sourceIdByUrl))
  );

  const out: NormalizedSourceItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") out.push(...r.value);
    // Rejected feeds are already logged inside fetchOne; nothing else to do.
  }

  // Newest-first sort; items without a date sink to the bottom.
  out.sort((a, b) => {
    const ad = a.published_at?.getTime() ?? 0;
    const bd = b.published_at?.getTime() ?? 0;
    return bd - ad;
  });
  return out;
}

/**
 * CAD-221: 48h freshness cut for the composer-time RSS path.
 *
 * Pure function. Splits items on `published_at`:
 *  - dated items inside the window are kept, sorted newest-first;
 *  - dated items older than the window are DROPPED (counted in `dropped`);
 *  - undated items are KEPT — regulatory PDFs and price snapshots often
 *    publish without a date and silently losing them is worse than a
 *    stale item — but they sort AFTER every dated item, in input order.
 */
export function applyFreshnessCut(
  items: readonly NormalizedSourceItem[],
  opts: { now?: Date; windowMs?: number } = {}
): { items: NormalizedSourceItem[]; dropped: number } {
  const nowMs = (opts.now ?? new Date()).getTime();
  const windowMs = opts.windowMs ?? RSS_FRESHNESS_WINDOW_MS;
  const dated: NormalizedSourceItem[] = [];
  const undated: NormalizedSourceItem[] = [];
  let dropped = 0;
  for (const it of items) {
    const t = it.published_at?.getTime();
    if (t == null || Number.isNaN(t)) {
      undated.push(it);
    } else if (nowMs - t <= windowMs) {
      dated.push(it);
    } else {
      dropped++;
    }
  }
  dated.sort(
    (a, b) => (b.published_at?.getTime() ?? 0) - (a.published_at?.getTime() ?? 0)
  );
  return { items: [...dated, ...undated], dropped };
}

async function fetchOne(
  feedUrl: string,
  parserImpl: Pick<Parser, "parseURL">,
  timeoutMs: number,
  sourceIdByUrl?: Readonly<Record<string, string>>
): Promise<NormalizedSourceItem[]> {
  // rss-parser doesn't expose AbortController, but its built-in timeout
  // covers us; we still race against a hard wall-clock cap as defense.
  const race = Promise.race([
    parserImpl.parseURL(feedUrl),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("rss-aggregate timeout")), timeoutMs + 500)
    ),
  ]);

  let parsed;
  try {
    parsed = await race;
  } catch (err) {
    console.warn(
      `[sources/rss] feed failed ${feedUrl}:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }

  const source_id = sourceIdForFeed(feedUrl, sourceIdByUrl);
  const items = (parsed.items ?? []).slice(0, MAX_ITEMS_PER_FEED);
  const out: NormalizedSourceItem[] = [];
  for (const raw of items) {
    const url = raw.link ?? raw.guid ?? null;
    const title = (raw.title ?? "").trim();
    if (!url || !title) continue;
    let published_at: Date | null = null;
    if (raw.isoDate) {
      const d = new Date(raw.isoDate);
      if (!Number.isNaN(d.getTime())) published_at = d;
    }
    const body = (raw.contentSnippet ?? raw.content ?? "").slice(0, 2_000);
    const item = parseNormalizedItem(
      {
        source_id,
        source_type: "rss",
        url,
        title: title.slice(0, 500),
        body_excerpt: body,
        published_at,
        raw_metadata: { feed_url: feedUrl, guid: raw.guid ?? null },
      },
      `feed=${source_id}`
    );
    if (item) out.push(item);
  }
  return out;
}
