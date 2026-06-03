/**
 * Ticket 2 — /admin/missing-capabilities structural invariants.
 *
 * We don't spin up Postgres in unit tests, so this is a source-pattern test
 * (same style as chat-starter-chips.test.ts) that pins the load-bearing
 * pieces of the admin page so regressions surface cheaply:
 *
 *   - SSR auth gate via createSupabaseServerClient + isAdminEmail.
 *   - 30-day window on digest_runs.metadata.lowConfidence.
 *   - Bucketing on metadata.specSubmittedTopic.templateId with
 *     '__off_template__' coalesce for un-classified rows.
 *   - "DESC count" sort (i.e. highest-demand-first).
 *   - The page references the editable templates file path in the footer
 *     so Faeez can find the source of truth from inside the UI.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const pagePath = fileURLToPath(
  new URL(
    "../app/admin/missing-capabilities/page.tsx",
    import.meta.url
  )
);
const source = readFileSync(pagePath, "utf8");

describe("/admin/missing-capabilities", () => {
  it("ssr-gates non-admins via isAdminEmail", () => {
    expect(source).toMatch(/createSupabaseServerClient/);
    expect(source).toMatch(/isAdminEmail\(user\.email\)/);
    expect(source).toMatch(/redirect\("\/auth\/sign-in"\)/);
  });

  it("filters digest_runs to last 30 days with metadata.lowConfidence present", () => {
    expect(source).toMatch(/FROM digest_runs/);
    expect(source).toMatch(/metadata \? 'lowConfidence'/);
    expect(source).toMatch(/interval '30 days'/);
  });

  it("buckets by specSubmittedTopic.templateId, off-template coalesces", () => {
    expect(source).toMatch(/specSubmittedTopic,templateId/);
    expect(source).toMatch(/__off_template__/);
  });

  it("sorts by descending low-confidence count (highest demand first)", () => {
    expect(source).toMatch(/ORDER BY low_confidence_count DESC/);
  });

  it("surfaces the templates file path so Faeez can edit + redeploy", () => {
    expect(source).toContain("apps/web/lib/digest-spec/templates.ts");
  });
});
