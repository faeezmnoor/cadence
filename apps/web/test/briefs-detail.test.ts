/**
 * Wave 6 / Bug 13 — /briefs/[id] detail page (Advanced tab port from /spec).
 *
 * Structural pin: confirms the per-brief detail page wires up the
 * Overview + Advanced tabs, the raw-JSON editor + version-history surface
 * ported from the legacy /spec page, and the per-brief tRPC procedures
 * (briefs.getById / listVersions / updateRaw) on the briefs router.
 *
 * Complements:
 *   - app-nav.test.ts → /spec is now a redirect; /briefs/[id] mounts AppNav
 *   - tier-explainer.test.ts → TierExplainer compact variant lives on /briefs/[id]
 *   - pro-tier-spec-tier.test.ts → tier toggle gating ported to /briefs/[id]
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { digestSpecSchema, DIGEST_SPEC_SCHEMA_VERSION } from "@/lib/digest-spec/schema";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const pageSource = read("../app/watches/[id]/page.tsx");
const clientSource = read("../app/watches/[id]/brief-detail-client.tsx");
const routerSource = read("../server/trpc/routers/briefs.ts");
const specRedirectSource = read("../app/spec/page.tsx");

describe("/briefs/[id] page — tabs", () => {
  it("declares Overview and Advanced tabs", () => {
    expect(clientSource).toMatch(/label="Overview"/);
    expect(clientSource).toMatch(/label="Advanced"/);
  });

  it("Overview is the default landing tab", () => {
    expect(clientSource).toMatch(/useState<Tab>\("overview"\)/);
  });

  it("server shell loads the brief by id, 404s on miss", () => {
    expect(pageSource).toMatch(/notFound\(\)/);
    expect(pageSource).toMatch(/eq\(digestSpecs\.id,\s*id\)/);
    expect(pageSource).toMatch(/eq\(digestSpecs\.userId,\s*user\.id\)/);
  });
});

describe("/briefs/[id] page — Advanced tab (raw JSON editor)", () => {
  it("Renders a raw-JSON textarea bound to the brief spec", () => {
    expect(clientSource).toMatch(/aria-label="Raw spec JSON"/);
    expect(clientSource).toMatch(/JSON\.stringify\(brief\.spec/);
  });

  it("Validates draft through digestSpecSchema before save", () => {
    expect(clientSource).toMatch(/digestSpecSchema\.safeParse/);
  });

  it("Calls briefs.updateRaw with the parsed spec and brief id", () => {
    expect(clientSource).toMatch(/trpc\.briefs\.updateRaw\.useMutation/);
    expect(clientSource).toMatch(/id:\s*brief\.id/);
  });

  it("Disables the editor for archived briefs (no edits possible)", () => {
    expect(clientSource).toMatch(/isArchived/);
    expect(clientSource).toMatch(/disabled=\{updateRaw\.isPending \|\| isArchived\}/);
  });
});

describe("/briefs/[id] page — version history (paginates)", () => {
  it("Renders a Show more button when more versions are available", () => {
    expect(clientSource).toMatch(/Show more/);
    expect(clientSource).toMatch(/canShowMore/);
  });

  it("Increases page size locally when Show more is clicked", () => {
    expect(clientSource).toMatch(/setPageSize\(\(s\) => s \+ 10\)/);
  });

  it("Calls listVersions with limit/offset bound to local pageSize", () => {
    expect(clientSource).toMatch(/trpc\.briefs\.listVersions\.useQuery/);
    expect(clientSource).toMatch(/limit: pageSize/);
  });
});

describe("briefs router — per-brief Wave 6 procedures", () => {
  it("exposes getById, listVersions, updateRaw, setTier", () => {
    expect(routerSource).toMatch(/getById:\s*protectedProcedure/);
    expect(routerSource).toMatch(/listVersions:\s*protectedProcedure/);
    expect(routerSource).toMatch(/updateRaw:\s*protectedProcedure/);
    expect(routerSource).toMatch(/setTier:\s*protectedProcedure/);
  });

  it("updateRaw refuses edits to archived briefs", () => {
    expect(routerSource).toMatch(/Cannot edit an archived brief/);
  });

  it("listVersions input takes limit + offset", () => {
    expect(routerSource).toMatch(/limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(50\)/);
    expect(routerSource).toMatch(/offset:\s*z\.number\(\)\.int\(\)\.min\(0\)/);
  });
});

describe("/spec → /watches redirect (legacy bookmark compat)", () => {
  it("/spec/page.tsx is a server redirect to /watches", () => {
    expect(specRedirectSource).toMatch(/redirect\(["']\/watches["']/);
  });

  it("the legacy spec-client.tsx has been deleted", () => {
    let threw = false;
    try {
      read("../app/spec/spec-client.tsx");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("raw-JSON edit roundtrip — digestSpecSchema parses what we render", () => {
  it("round-trips a minimal valid spec via JSON.stringify → JSON.parse → safeParse", () => {
    const spec = {
      schema_version: DIGEST_SPEC_SCHEMA_VERSION,
      topics: ["palm oil"],
      cadence: {
        frequency: "daily",
        delivery_time_local: "07:00",
        days_of_week: [1, 2, 3, 4, 5],
      },
    };
    const serialized = JSON.stringify(spec, null, 2);
    const parsed = JSON.parse(serialized);
    const result = digestSpecSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("rejects malformed JSON edits with a Zod error", () => {
    const result = digestSpecSchema.safeParse({ topics: 123 });
    expect(result.success).toBe(false);
  });
});
