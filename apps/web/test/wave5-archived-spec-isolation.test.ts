/**
 * Wave 5 Bug 10 / Bug 11 regression — archived briefs must not be reachable
 * via any of the legacy single-brief query paths:
 *
 *   - digest cron pipeline (server/digest/run.ts)
 *   - sampleNow expected-spec guard (server/trpc/routers/digest.ts)
 *   - RSS poller declared-feeds harvest (server/connectors/rss.ts)
 *   - digestSpec.getCurrent (server/trpc/routers/digestSpec.ts)
 *
 * Root cause: briefs.archive previously flipped status -> 'archived' but
 * left is_current=true, so every legacy `eq(isCurrent, true)` query kept
 * routing to the tombstoned spec. The fix is belt-and-suspenders:
 *
 *  1. briefs.archive now sets isCurrent=false in addition to status
 *  2. every delivery-critical query also filters status != 'archived'
 *
 * Bug 11 (2026-06-09 17:03 stray sample brief to chat 27643893) was the
 * production symptom of this same drift — covered by the same fix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("Wave 5 Bug 10 — archived spec isolation", () => {
  it("server/digest/run.ts filters status != 'archived' on the current-spec lookup", () => {
    const src = readSrc("server/digest/run.ts");
    expect(src).toMatch(/ne\(digestSpecs\.status,\s*"archived"\)/);
  });

  it("server/trpc/routers/digest.ts sampleNow guard filters status != 'archived'", () => {
    const src = readSrc("server/trpc/routers/digest.ts");
    expect(src).toMatch(/ne\(digestSpecs\.status,\s*"archived"\)/);
  });

  it("server/connectors/rss.ts listDeclaredFeeds filters status != 'archived'", () => {
    const src = readSrc("server/connectors/rss.ts");
    expect(src).toMatch(/ne\(digestSpecs\.status,\s*"archived"\)/);
  });

  it("server/trpc/routers/digestSpec.ts getCurrent filters status != 'archived'", () => {
    const src = readSrc("server/trpc/routers/digestSpec.ts");
    // First isCurrent block (getCurrent) must include the archived guard.
    const getCurrentBlock = src
      .split("getCurrent: protectedProcedure.query")[1]
      ?.split(/\}\),\n/)[0];
    expect(getCurrentBlock).toBeDefined();
    expect(getCurrentBlock).toMatch(/ne\(digestSpecs\.status,\s*"archived"\)/);
  });

  it("briefs.archive sets isCurrent=false alongside status='archived'", () => {
    const src = readSrc("server/trpc/routers/briefs.ts");
    const archiveBlock = src
      .split("archive: protectedProcedure")[1]
      ?.split("preview: protectedProcedure")[0];
    expect(archiveBlock).toBeDefined();
    expect(archiveBlock).toMatch(/status:\s*"archived"/);
    expect(archiveBlock).toMatch(/isCurrent:\s*false/);
  });
});
