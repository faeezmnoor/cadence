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

export const add_rss_feed: ToolDescriptor<typeof addRssFeedSchema> = {
  name: "add_rss_feed",
  description:
    "Append an RSS feed to the draft. Use only when the user explicitly volunteers a URL. URL must be http/https and parseable.",
  schema: addRssFeedSchema,
  handler: async (input, ctx) => {
    // Extra guard: only http(s)
    try {
      const u = new URL(input.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("only http(s) URLs are allowed");
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
