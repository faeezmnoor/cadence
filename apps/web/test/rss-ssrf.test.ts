/**
 * SSRF guards on the RSS pipeline (P0 — see Phase 2 QA notes).
 *
 * - add_rss_feed tool: refuses private/loopback/link-local/metadata hosts
 * - rss.pollFeed: defense-in-depth — refuses even if a bad URL slipped in
 */
import { describe, it, expect } from "vitest";
import { add_rss_feed } from "../server/ai/config-agent/tools/add_rss_feed";
import { pollFeed } from "../server/connectors/rss";
import { emptyDraft } from "../server/ai/config-agent/draft";

const ctx = () =>
  ({
    session: { draft: emptyDraft() },
  }) as unknown as Parameters<typeof add_rss_feed.handler>[1];

const BLOCKED = [
  "http://127.0.0.1/feed.xml",
  "http://localhost/feed.xml",
  "http://10.0.0.5/feed",
  "http://192.168.1.1/feed",
  "http://172.16.0.1/feed",
  "http://172.31.255.255/feed",
  "http://169.254.169.254/latest/meta-data/", // AWS metadata
  "http://100.64.0.1/feed",                   // CGNAT / Tailscale
  "http://metadata.google.internal/",
  "http://internal-service/feed",             // bare hostname
  "http://0.0.0.0/feed",
];

const ALLOWED = [
  "https://example.com/feed.xml",
  "https://news.ycombinator.com/rss",
  "http://feeds.bbci.co.uk/news/rss.xml",
];

describe("add_rss_feed SSRF guard", () => {
  for (const url of BLOCKED) {
    it(`rejects ${url}`, async () => {
      await expect(
        add_rss_feed.handler({ url, label: "x" }, ctx())
      ).rejects.toThrow(/blocked|not parseable|only http/i);
    });
  }
  for (const url of ALLOWED) {
    it(`accepts ${url}`, async () => {
      const res = (await add_rss_feed.handler(
        { url, label: "x" },
        ctx()
      )) as { ok: boolean };
      expect(res.ok).toBe(true);
    });
  }
  it("rejects javascript: scheme", async () => {
    await expect(
      add_rss_feed.handler(
        { url: "javascript:alert(1)" as unknown as string, label: "x" },
        ctx()
      )
    ).rejects.toThrow();
  });
});

describe("rss.pollFeed defense-in-depth", () => {
  it("refuses 169.254 metadata even without DB write", async () => {
    const r = await pollFeed("http://169.254.169.254/latest/meta-data/", []);
    expect(r.error).toMatch(/unsafe feed URL refused/);
    expect(r.fetched).toBe(0);
    expect(r.inserted).toBe(0);
  });
  it("refuses bare localhost", async () => {
    const r = await pollFeed("http://localhost/feed", []);
    expect(r.error).toMatch(/unsafe feed URL refused/);
  });
});
