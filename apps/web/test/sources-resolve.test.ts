/**
 * Evals Phase 0 — source URL resolver unit tests.
 *
 * Pure function with `fetch` injected; we don't touch the network. We
 * assert:
 *   - 200 -> resolved
 *   - 404 -> not resolved
 *   - HEAD 405 falls back to GET (per resolver contract)
 *   - timeout produces error="timeout", status=0
 *   - aggregate rate is correct
 */
import { describe, it, expect } from "vitest";
import {
  resolveSourceUrls,
  sourcesResolvedRate,
} from "@/server/digest/sources/resolve";

function fakeFetch(map: Record<string, { status: number; methodSeen?: string[] }>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const entry = map[url];
    if (!entry) throw new Error(`unmocked URL ${url}`);
    entry.methodSeen ??= [];
    entry.methodSeen.push(init?.method ?? "GET");
    return new Response(null, { status: entry.status });
  }) as typeof fetch;
}

describe("resolveSourceUrls", () => {
  it("returns empty array for empty input", async () => {
    const out = await resolveSourceUrls([]);
    expect(out).toEqual([]);
  });

  it("marks 200 as resolved, 404 as not resolved", async () => {
    const map = {
      "https://ok.example/article": { status: 200 },
      "https://gone.example/article": { status: 404 },
    };
    const out = await resolveSourceUrls(Object.keys(map), {
      fetchImpl: fakeFetch(map),
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      url: "https://ok.example/article",
      status: 200,
      resolved: true,
    });
    expect(out[1]).toMatchObject({
      url: "https://gone.example/article",
      status: 404,
      resolved: false,
    });
    expect(out[1]!.error).toBe("HTTP 404");
  });

  it("falls back from HEAD-405 to GET", async () => {
    // First call (HEAD) returns 405; resolver must retry with GET.
    let calls = 0;
    const fetchImpl: typeof fetch = (async (input, init) => {
      calls++;
      const method = init?.method;
      if (method === "HEAD") return new Response(null, { status: 405 });
      if (method === "GET") return new Response(null, { status: 200 });
      throw new Error("unexpected method");
    }) as typeof fetch;
    const [r] = await resolveSourceUrls(["https://head-hostile.example/a"], {
      fetchImpl,
    });
    expect(calls).toBe(2);
    expect(r!.resolved).toBe(true);
    expect(r!.status).toBe(200);
  });

  it("treats fetch rejection (timeout / DNS) as status=0, resolved=false", async () => {
    const fetchImpl: typeof fetch = (async () => {
      const err = new Error("aborted") as Error & { name?: string };
      err.name = "AbortError";
      throw err;
    }) as typeof fetch;
    const [r] = await resolveSourceUrls(["https://timeout.example/x"], {
      fetchImpl,
      timeoutMs: 10,
    });
    expect(r!.status).toBe(0);
    expect(r!.resolved).toBe(false);
    expect(r!.error).toBe("timeout");
  });

  it("3xx counts as resolved (redirect target is what humans hit)", async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response(null, { status: 301 })) as typeof fetch;
    const [r] = await resolveSourceUrls(["https://redir.example/x"], {
      fetchImpl,
    });
    expect(r!.resolved).toBe(true);
    expect(r!.status).toBe(301);
  });
});

describe("sourcesResolvedRate", () => {
  it("returns 0 on empty input", () => {
    expect(sourcesResolvedRate([])).toBe(0);
  });

  it("computes resolved/total", () => {
    const rate = sourcesResolvedRate([
      { url: "a", status: 200, resolved: true, latencyMs: 1 },
      { url: "b", status: 404, resolved: false, latencyMs: 1 },
      { url: "c", status: 200, resolved: true, latencyMs: 1 },
      { url: "d", status: 200, resolved: true, latencyMs: 1 },
    ]);
    expect(rate).toBe(0.75);
  });
});
