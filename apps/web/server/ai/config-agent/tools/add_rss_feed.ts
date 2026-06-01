/**
 * Tool: add_rss_feed
 *
 * Append an RSS feed to the draft's `rss_feeds` array. Only call when the
 * user explicitly volunteers a URL — never invent feeds.
 *
 * Validates:
 *   - URL parseable + http(s) only.
 *   - Label non-empty.
 *   - No duplicates by URL (idempotent if agent retries).
 *   - Stays under the schema's max of 20.
 */
import { z } from "zod";
import { rssFeedSchema } from "@/lib/digest-spec/schema";
import { emptyDraft, mergeProposal } from "../draft";
import type { ToolDescriptor } from "../types";

const addRssFeedSchema = rssFeedSchema; // {url, label}, both validated

/**
 * Block SSRF-prone hostnames: loopback, RFC1918 private ranges, link-local,
 * cloud metadata endpoints, and bare hostnames (no dot — could resolve to
 * an internal service). The poller fetches arbitrary URLs hourly, so we
 * reject these at write time rather than at fetch time.
 *
 * Conservative on purpose: DNS rebinding is still possible, but defeating
 * that requires resolving + re-checking at fetch time, which is T-303 work.
 */
function isSsrfHost(hostname: string): boolean {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  // localhost variants
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // bare hostname (no dot) — likely internal
  if (!h.includes(".") && !h.includes(":")) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("[fe80") || h.startsWith("[fc") || h.startsWith("[fd")) return true;
  // IPv4 dotted-quad
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1).map((n) => parseInt(n, 10));
    if (o.some((x) => x > 255)) return true;
    const [a, b] = o;
    if (a === 10) return true;                       // 10/8
    if (a === 127) return true;                      // loopback
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;         // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10 (Tailscale etc)
    if (a >= 224) return true;                       // multicast + reserved
  }
  // AWS/Azure/GCP metadata FQDN
  if (h === "metadata.google.internal" || h === "metadata.goog") return true;
  return false;
}


export const add_rss_feed: ToolDescriptor<typeof addRssFeedSchema> = {
  name: "add_rss_feed",
  description:
    "Append an RSS feed to the draft. Use only when the user explicitly volunteers a URL. URL must be http/https and parseable.",
  schema: addRssFeedSchema,
  handler: async (input, ctx) => {
    // Extra guard: only http(s) + block SSRF-prone hosts.
    try {
      const u = new URL(input.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("only http(s) URLs are allowed");
      }
      if (isSsrfHost(u.hostname)) {
        throw new Error(
          `RSS URL host '${u.hostname}' is blocked (private/loopback/link-local/metadata range).`
        );
      }
    } catch (err) {
      throw new Error(
        `RSS URL is not parseable: ${err instanceof Error ? err.message : "unknown"}`
      );
    }

    const current = ctx.session.draft ?? emptyDraft();
    const existingFeeds = current.rss_feeds ?? [];

    // Idempotent dedupe by URL.
    if (existingFeeds.some((f) => f.url === input.url)) {
      return {
        ok: true as const,
        already_present: true,
        draft: current,
      };
    }

    if (existingFeeds.length >= 20) {
      throw new Error("rss_feeds is full (max 20)");
    }

    const next = mergeProposal(current, {
      rss_feeds: [...existingFeeds, input],
    });
    ctx.session.draft = next;
    return {
      ok: true as const,
      already_present: false,
      draft: next,
    };
  },
};
