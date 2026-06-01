/**
 * Brave Search connector (T-205, CAD-28).
 *
 * Cadence uses Brave Web Search as its general web-discovery source for the
 * composer. We wrap it with a Postgres-backed cache (`source_cache`) so that
 * multiple users searching for overlapping queries on the same day (e.g.
 * "palm oil price") share a single paid API call.
 *
 * STUB STATE (2026-06-01):
 *   BRAVE_SEARCH_API_KEY is NOT yet provisioned. The function shape, cache
 *   table writes, and call-site plumbing are all in place. Any actual
 *   network call throws a clear `BraveKeyMissingError` pointing to CAD-56.
 *   Faeez: paste the key into `apps/web/.env.local` + Vercel and the
 *   connector becomes live with zero further code changes.
 */
import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sourceCache } from "@/server/db/schema";
import { braveCostUsd, recordCost } from "@/server/cost/record";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  /** ISO 8601 timestamp if Brave provided one. */
  age?: string;
}

export interface BraveSearchOptions {
  /** Default 20 — composer caller can clamp lower. */
  count?: number;
  /** ISO-639-1, e.g. "en". Defaults to "en". */
  searchLang?: string;
  /** Country code, e.g. "MY". Defaults to "ALL". */
  country?: string;
  /** Cache TTL in seconds. Default 6 hours — news moves fast. */
  cacheTtlSeconds?: number;
  /** Cost-attribution metadata — for `cost_events` rollup. */
  userId?: string | null;
  digestRunId?: string | null;
}

export interface BraveSearchResponse {
  query: string;
  results: BraveSearchResult[];
  fromCache: boolean;
  cachedAt?: Date;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BraveKeyMissingError extends Error {
  constructor() {
    super(
      "Brave Search key not configured. Set BRAVE_SEARCH_API_KEY in env. " +
        "See CAD-56 (Phase 2 state notes: cadence/PHASE2-STATE.md)."
    );
    this.name = "BraveKeyMissingError";
  }
}

export class BraveSearchError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "BraveSearchError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONNECTOR = "brave_search" as const;
const DEFAULT_COUNT = 20;
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export function isBraveConfigured(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

/**
 * Cache key. Normalize query (trim + lowercase + collapse ws) so that
 * "Palm Oil " and "palm  oil" share a cache row, but preserve uniqueness
 * per (count, lang, country) tuple to avoid mismatched payloads.
 */
function cacheKeyFor(
  query: string,
  count: number,
  searchLang: string,
  country: string
): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  const composite = `${normalized}|c=${count}|l=${searchLang}|cc=${country}`;
  return createHash("sha256").update(composite).digest("hex");
}

interface BraveApiWebItem {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveApiResponse {
  web?: { results?: BraveApiWebItem[] };
}

function parseBraveResponse(json: BraveApiResponse): BraveSearchResult[] {
  const items = json.web?.results ?? [];
  const seen = new Set<string>();
  const out: BraveSearchResult[] = [];
  for (const item of items) {
    if (!item.url || !item.title) continue;
    // Dedup by URL (normalize trailing slash).
    const key = item.url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: item.title,
      url: item.url,
      description: item.description ?? "",
      age: item.age,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cache layer
// ---------------------------------------------------------------------------

interface CachedPayload {
  query: string;
  results: BraveSearchResult[];
}

async function readCache(
  key: string
): Promise<{ payload: CachedPayload; cachedAt: Date } | null> {
  const rows = await db
    .select({
      payload: sourceCache.payload,
      createdAt: sourceCache.createdAt,
    })
    .from(sourceCache)
    .where(
      and(
        eq(sourceCache.connector, CONNECTOR),
        eq(sourceCache.key, key),
        gt(sourceCache.expiresAt, new Date())
      )
    )
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    payload: row.payload as CachedPayload,
    cachedAt: row.createdAt as Date,
  };
}

async function writeCache(
  key: string,
  payload: CachedPayload,
  ttlSeconds: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  // Upsert on (connector, key) — second call with same query refreshes ttl.
  await db
    .insert(sourceCache)
    .values({ connector: CONNECTOR, key, payload, expiresAt })
    .onConflictDoUpdate({
      target: [sourceCache.connector, sourceCache.key],
      set: {
        payload,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search Brave for `query`. Hits cache when possible; otherwise calls Brave
 * and logs a `cost_events` row.
 *
 * Throws `BraveKeyMissingError` if no key is set AND cache is empty.
 */
export async function braveSearch(
  query: string,
  opts: BraveSearchOptions = {}
): Promise<BraveSearchResponse> {
  if (!query.trim()) {
    return { query, results: [], fromCache: false };
  }
  const count = Math.min(opts.count ?? DEFAULT_COUNT, 20);
  const searchLang = opts.searchLang ?? "en";
  const country = opts.country ?? "ALL";
  const ttl = opts.cacheTtlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKeyFor(query, count, searchLang, country);

  // 1. Cache check.
  const hit = await readCache(key);
  if (hit) {
    return {
      query: hit.payload.query,
      results: hit.payload.results,
      fromCache: true,
      cachedAt: hit.cachedAt,
    };
  }

  // 2. Cache miss. Need API key.
  if (!isBraveConfigured()) {
    throw new BraveKeyMissingError();
  }

  // 3. Live call.
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("search_lang", searchLang);
  url.searchParams.set("country", country);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
    },
    // Brave's docs: keep timeout tight, composer is latency-sensitive.
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BraveSearchError(
      res.status,
      `Brave Search ${res.status}: ${body.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as BraveApiResponse;
  const results = parseBraveResponse(json);

  // 4. Cost log — every live call is paid, even zero-result.
  await recordCost({
    userId: opts.userId ?? null,
    digestRunId: opts.digestRunId ?? null,
    kind: "search_api",
    provider: "brave",
    costUsd: braveCostUsd(),
  });

  // 5. Cache write — best-effort, never block return.
  const payload: CachedPayload = { query, results };
  void writeCache(key, payload, ttl).catch((err) => {
    console.error("[brave-search] cache write failed", err);
  });

  return { query, results, fromCache: false };
}
