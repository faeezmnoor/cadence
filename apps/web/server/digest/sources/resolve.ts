/**
 * Source URL resolution check (Evals Phase 0).
 *
 * After the composer returns its JSON brief, we want a cheap, post-hoc
 * "do the URLs we cited actually exist?" signal. This is the most basic
 * grounding eval: a brief that cites dead links is dead-on-arrival
 * regardless of how well it reads.
 *
 * Contract:
 *   - HEAD request first; some hosts (LinkedIn, Cloudflare-fronted news
 *     sites) reject HEAD with 405/403. On those we retry once with a tiny
 *     GET (no-store, no body read) before declaring failure.
 *   - 5s per-URL timeout via AbortController. We never want a slow host
 *     to stall an entire digest pipeline.
 *   - Parallel — we don't care about ordering, only the aggregate rate.
 *   - Returns BOTH the per-URL rows AND the aggregate rate so the caller
 *     can stash the whole thing in `digest_runs.metadata.sourceResolve`
 *     for the per-run viewer.
 *
 * Failure semantics:
 *   - "resolved" = HTTP 2xx/3xx, anything else (4xx, 5xx, timeout, DNS,
 *     network reset, abort) counts as unresolved.
 *   - We deliberately count 3xx as resolved — the redirect target is what
 *     a human reader will actually hit, and we can't validate the chain
 *     without burning latency.
 *   - This function NEVER throws. Errors are folded into the row so the
 *     digest pipeline cannot fail because of a flaky third-party host.
 */

const PER_URL_TIMEOUT_MS = 5_000;
const USER_AGENT = "CadenceBot/1.0 (+https://cadence.news/eval)";

export interface SourceResolveResult {
  url: string;
  /** HTTP status code. 0 = network error / timeout / aborted. */
  status: number;
  /** True iff status was 2xx or 3xx. */
  resolved: boolean;
  /** Wall-clock latency for the resolved attempt, ms. */
  latencyMs: number;
  /** Present only on failure: short tag like "timeout", "dns", "network". */
  error?: string;
}

/**
 * Resolve a list of URLs in parallel. Always returns one row per input URL,
 * preserving input order. Duplicates are checked individually (cheap, and
 * the caller is responsible for de-duping if they care).
 */
export type ResolveSourceUrlsFn = (
  urls: readonly string[],
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
) => Promise<SourceResolveResult[]>;

export async function resolveSourceUrls(
  urls: readonly string[],
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<SourceResolveResult[]> {
  if (urls.length === 0) return [];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? PER_URL_TIMEOUT_MS;
  return Promise.all(urls.map((u) => resolveOne(u, fetchImpl, timeoutMs)));
}

async function resolveOne(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<SourceResolveResult> {
  const start = Date.now();

  // First attempt: HEAD. Cheap, and ~80% of hosts honor it correctly.
  const head = await tryRequest(url, "HEAD", fetchImpl, timeoutMs);
  if (head.status >= 200 && head.status < 400) {
    return {
      url,
      status: head.status,
      resolved: true,
      latencyMs: Date.now() - start,
    };
  }

  // HEAD-hostile hosts (LinkedIn, some Cloudflare, some Reuters edge):
  // retry once with GET. We still don't read the body — the response
  // status is what we care about, and dropping the body avoids the
  // bandwidth hit on PDF / video URLs.
  if (head.status === 405 || head.status === 403 || head.status === 0) {
    const get = await tryRequest(url, "GET", fetchImpl, timeoutMs);
    const resolved = get.status >= 200 && get.status < 400;
    return {
      url,
      status: get.status,
      resolved,
      latencyMs: Date.now() - start,
      ...(resolved ? {} : { error: get.error ?? `HTTP ${get.status}` }),
    };
  }

  return {
    url,
    status: head.status,
    resolved: false,
    latencyMs: Date.now() - start,
    error: head.error ?? `HTTP ${head.status}`,
  };
}

async function tryRequest(
  url: string,
  method: "HEAD" | "GET",
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<{ status: number; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT },
    });
    // Read+discard body on GET so the socket can be released cleanly.
    if (method === "GET") {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
    }
    return { status: res.status };
  } catch (err) {
    return { status: 0, error: classifyFetchError(err) };
  } finally {
    clearTimeout(timer);
  }
}

function classifyFetchError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  const message = String((err as { message?: string } | null)?.message ?? "");
  if (name === "AbortError" || /aborted|timeout/i.test(message)) return "timeout";
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(message)) return "dns";
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH/i.test(message)) return "network";
  return "network";
}

/**
 * Aggregate resolved-rate across a batch. Returns NaN-safe 0 for empty input.
 */
export function sourcesResolvedRate(results: readonly SourceResolveResult[]): number {
  if (results.length === 0) return 0;
  const ok = results.reduce((n, r) => n + (r.resolved ? 1 : 0), 0);
  return ok / results.length;
}
