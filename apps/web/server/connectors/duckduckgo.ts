/**
 * DuckDuckGo HTML connector (CAD-165 / T-610).
 *
 * Keyless web search via the DuckDuckGo HTML endpoint
 * (html.duckduckgo.com/html/). No API key — this is the Standard stack's
 * reliability fallback when the grandfathered Brave key lapses or errors,
 * and a selectable provider in its own right (Decisions Log D-011 registry).
 *
 * Lower volume than Brave, but "a brief with DDG sources" beats "no brief
 * because the one search key expired". Pipeline owns retry (providers/types.ts
 * contract): a single timed request, throw on transport failure.
 */
import { recordCost } from "@/server/cost/record";

export interface DuckDuckGoResult {
  title: string;
  url: string;
  snippet: string;
}

const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";
const DEFAULT_COUNT = 10;
const REQUEST_TIMEOUT_MS = 8000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * DDG wraps outbound links in a redirect: `//duckduckgo.com/l/?uddg=<enc>&rut=…`.
 * Decode the real target; fall back to a protocol-relative / absolute href.
 */
function decodeDdgUrl(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      return "";
    }
  }
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("http")) return href;
  return "";
}

/**
 * Parse the DDG HTML SERP into normalized results. Exported for unit testing
 * against a captured fixture (test/fixtures/ddg-*.html) — the regex shape is
 * the brittle part, so it gets a pinned test rather than a live network call.
 */
export function parseDuckDuckGoHtml(
  html: string,
  limit = DEFAULT_COUNT
): DuckDuckGoResult[] {
  const out: DuckDuckGoResult[] = [];
  const seen = new Set<string>();

  // Snippets, in document order, paired to anchors by index.
  const snippets: string[] = [];
  const snippetRe =
    /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(stripHtml(sm[1]!));

  const anchorRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let am: RegExpExecArray | null;
  let idx = 0;
  while ((am = anchorRe.exec(html)) && out.length < limit) {
    const url = decodeDdgUrl(am[1]!);
    const title = stripHtml(am[2]!);
    const snippet = snippets[idx] ?? "";
    idx++;
    if (!url || !title) continue;
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url, snippet });
  }
  return out;
}

/**
 * Search DuckDuckGo for `query`. Keyless → $0; logs a `cost_events` row with
 * provider "duckduckgo" and cost 0 so the rollup stays complete (parity with
 * the Brave connector — no search path without an attribution row).
 */
export async function duckDuckGoSearch(
  query: string,
  opts: { count?: number; userId?: string | null; digestRunId?: string | null } = {}
): Promise<{ query: string; results: DuckDuckGoResult[] }> {
  if (!query.trim()) return { query, results: [] };
  const count = Math.min(opts.count ?? DEFAULT_COUNT, 20);

  const body = new URLSearchParams({ q: query, kl: "wt-wt" }).toString();
  const res = await fetch(DDG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // DDG's HTML endpoint rejects empty/obvious-bot UAs; identify honestly.
      "User-Agent":
        "Mozilla/5.0 (compatible; CadenceBot/1.0; +https://cadence.news)",
      Accept: "text/html",
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo HTML ${res.status}`);
  }
  const html = await res.text();
  const results = parseDuckDuckGoHtml(html, count);

  await recordCost({
    userId: opts.userId ?? null,
    digestRunId: opts.digestRunId ?? null,
    kind: "search_api",
    provider: "duckduckgo",
    costUsd: 0,
  }).catch(() => {});

  return { query, results };
}
