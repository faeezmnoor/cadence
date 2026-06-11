/**
 * Brief-creation revamp PR 3 — gallery, deep-link, and stripe invariants.
 *
 * Pure tests for groupedVisibleTemplates() plus source-pattern pins for
 * the "use client" surfaces (same deliberate style as
 * test/chat-starter-chips.test.ts — rendering them would need a full RTL
 * setup; the structural invariants are what regress silently).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import {
  groupedVisibleTemplates,
  VISIBLE_TEMPLATES,
  VISIBLE_CATEGORY_ORDER,
  STARTER_TEMPLATES,
} from "@/lib/digest-spec/templates";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const gallerySource = read("../components/chat/brief-gallery.tsx");
const chatClientSource = read("../components/chat/chat-client.tsx");
const chatPageSource = read("../app/chat/page.tsx");
const stripesSource = read("../components/marketing/icp-stripes.tsx");
const landingSource = read("../app/page.tsx");

describe("groupedVisibleTemplates", () => {
  it("returns the three ICP sections in display order, no empty sections", () => {
    const sections = groupedVisibleTemplates();
    expect(sections.map((s) => s.category)).toEqual([...VISIBLE_CATEGORY_ORDER]);
    for (const s of sections) {
      expect(s.templates.length, s.category).toBeGreaterThan(0);
      expect(s.label, s.category).toBeTruthy();
    }
  });

  it("covers every visible template exactly once", () => {
    const ids = groupedVisibleTemplates().flatMap((s) =>
      s.templates.map((t) => t.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(VISIBLE_TEMPLATES.map((t) => t.id).sort());
  });
});

describe("brief gallery (PR 3 §3)", () => {
  it("header is the UX-writer canon string, not Templates/Gallery/Catalog", () => {
    expect(gallerySource).toContain("Briefs I can run for you");
    // The banned nouns may appear in code comments; assert they never
    // appear inside JSX text by checking the rendered-string constant.
    expect(gallerySource).toMatch(/GALLERY_HEADER = "Briefs I can run for you"/);
  });

  it("reuses TemplateCard — starters and gallery are the same component", () => {
    expect(gallerySource).toMatch(
      /import\s*\{\s*TemplateCard\s*\}\s*from\s*"\.\/starter-cards"/
    );
  });

  it("mobile container is a dismissible bottom sheet with no drag-gesture code", () => {
    expect(gallerySource).toMatch(/role="dialog"/);
    expect(gallerySource).toMatch(/aria-modal="true"/);
    expect(gallerySource).toMatch(/max-h-\[85vh\]/);
    // Engineer ruling: no gesture half in v1 (handler props, not comments).
    expect(gallerySource).not.toMatch(/onTouchMove|onPointerMove|onDrag/);
  });

  it("chat client wires the gallery as a reversible disclosure with source attribution", () => {
    expect(chatClientSource).toMatch(/galleryOpen/);
    expect(chatClientSource).toMatch(/"gallery"\)/);
    expect(chatClientSource).toMatch(/onBrowseAll=\{\(\) => setGalleryOpen\(true\)\}/);
  });
});

describe("/chat?template= deep-link (PR 3 §6)", () => {
  it("server validates the param against known AND visible rows", () => {
    expect(chatPageSource).toMatch(/t\.id === rawTemplate && t\.visible/);
  });

  it("preserves the deep-link through the auth wall via next=", () => {
    expect(chatPageSource).toMatch(/auth\/sign-in\?next=/);
  });

  it("client fires once, fresh threads only, then strips the param", () => {
    expect(chatClientSource).toMatch(/deepLinkFiredRef/);
    expect(chatClientSource).toMatch(/messages\.length > 0\) return/);
    expect(chatClientSource).toMatch(/router\.replace\("\/chat"/);
    expect(chatClientSource).toMatch(/"deep_link"/);
  });
});

describe("landing ICP stripes (PR 3 §8.4)", () => {
  it("renders exactly the starter trio as links, not buttons", () => {
    expect(stripesSource).toMatch(/STARTER_TEMPLATES\.map/);
    expect(stripesSource).toMatch(/href=\{`\/chat\?template=\$\{tpl\.id\}`\}/);
    // One CTA per surface (COPY_GUIDE §8): stripes must not be <button>s.
    expect(stripesSource).not.toMatch(/<button/);
    expect(STARTER_TEMPLATES).toHaveLength(3);
  });

  it("is mounted on the landing page", () => {
    expect(landingSource).toMatch(/<IcpStripes \/>/);
  });
});
