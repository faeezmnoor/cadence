/**
 * Security HIGH #4 — smoke coverage for the PDPA 30d brief-content purge.
 *
 * We don't exercise real SQL here — we assert the shape of the query the
 * function issues so the deletion targets ONLY soft-deleted users older
 * than 30 days. Getting that predicate wrong would be a P0 (purging live
 * users' briefs) so it's worth a one-test guard.
 */
import { describe, it, expect, vi } from "vitest";
import { purgeSoftDeletedBriefs } from "@/server/inngest/functions/purge-soft-deleted-briefs";

describe("purgeSoftDeletedBriefs", () => {
  it("issues an UPDATE that filters on soft-deleted users >30d and non-null composed_markdown", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "r1" }, { id: "r2" }] });
    const fakeDb = { execute } as unknown as Parameters<typeof purgeSoftDeletedBriefs>[0];

    const out = await purgeSoftDeletedBriefs(fakeDb);

    expect(out.scrubbedCount).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);

    // drizzle SQL fragments stringify via their .queryChunks. Easiest reliable
    // assertion: the assembled SQL string from the fragment contains the
    // predicate we care about.
    const arg = execute.mock.calls[0]![0] as { queryChunks?: unknown[] };
    const text = JSON.stringify(arg.queryChunks ?? arg);

    expect(text).toContain("UPDATE digest_runs");
    expect(text).toContain("composed_markdown = NULL");
    expect(text).toContain("sources_bundle = NULL");
    expect(text).toContain("sourceResolve,results");
    expect(text).toContain("deleted_at IS NOT NULL");
    expect(text).toContain("deleted_at < now() - interval '30 days'");
    expect(text).toContain("composed_markdown IS NOT NULL");
  });

  it("returns 0 when no rows match", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const fakeDb = { execute } as unknown as Parameters<typeof purgeSoftDeletedBriefs>[0];

    const out = await purgeSoftDeletedBriefs(fakeDb);
    expect(out.scrubbedCount).toBe(0);
  });
});
