/**
 * Designer #4 (design-audit-v1 §1): persistent top nav after auth.
 *
 * Pins:
 *   - tabs: Chat / Briefs / Delivery / Billing (NOT "Telegram" — see
 *     feedback_cadence_positioning; Cadence is channel-agnostic).
 *   - "Briefs" replaced "Spec" in the multi-brief Phase A UI wave; the
 *     /spec page still exists as a legacy power-user editor but is no
 *     longer in the nav.
 *   - wordmark links to /chat
 *   - sign-out form posts to /auth/sign-out
 *   - mounted on chat / briefs / spec / admin routes
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const navSource = read("../components/nav/app-nav.tsx");

describe("AppNav (Designer #4)", () => {
  it("declares the four user-facing tabs with the correct hrefs", () => {
    expect(navSource).toMatch(/label:\s*"Chat",\s*href:\s*"\/chat"/);
    expect(navSource).toMatch(/label:\s*"Watches",\s*href:\s*"\/watches"/);
    expect(navSource).toMatch(/label:\s*"Delivery",\s*href:\s*"\/app\/link"/);
    expect(navSource).toMatch(
      /label:\s*"Billing",\s*href:\s*"\/settings\/billing"/
    );
  });

  it("does NOT use Telegram as a tab label (positioning rule)", () => {
    // Allow comments to mention Telegram for context; the label literal
    // must not be "Telegram".
    expect(navSource).not.toMatch(/label:\s*"Telegram"/);
  });

  it("wordmark links to /chat, not /", () => {
    expect(navSource).toMatch(/href=\{"\/chat" as never\}/);
  });

  it("renders a sign-out form posting to /auth/sign-out", () => {
    expect(navSource).toMatch(
      /<form action="\/auth\/sign-out" method="post">/
    );
  });

  it("has a mobile tab row (sm:hidden) below the main bar", () => {
    expect(navSource).toMatch(/sm:hidden/);
    expect(navSource).toMatch(/aria-label="Primary \(mobile\)"/);
  });

  it("highlights the active tab via aria-current=page", () => {
    expect(navSource).toMatch(/aria-current=\{isActive \? "page" : undefined\}/);
  });
});

describe("AppNav mount points", () => {
  it("is rendered on /chat", () => {
    const src = read("../app/chat/page.tsx");
    expect(src).toMatch(/import \{ AppNav \} from/);
    expect(src).toMatch(/<AppNav active="chat" \/>/);
  });

  it("is rendered on /watches", () => {
    const src = read("../app/watches/page.tsx");
    expect(src).toMatch(/import \{ AppNav \} from/);
    expect(src).toMatch(/<AppNav active="briefs" \/>/);
  });

  it("is rendered on /watches/[id] (per-watch detail; tab highlights Watches)", () => {
    const src = read("../app/watches/[id]/page.tsx");
    expect(src).toMatch(/<AppNav active="briefs" \/>/);
  });

  it("/spec page is a redirect to /watches (legacy bookmark compat)", () => {
    const src = read("../app/spec/page.tsx");
    expect(src).toMatch(/redirect\(["']\/watches["']/);
  });

  it("is rendered on /app/link", () => {
    const src = read("../app/app/link/page.tsx");
    expect(src).toMatch(/<AppNav active="link" \/>/);
  });

  it("is rendered on /admin/runs", () => {
    const src = read("../app/admin/runs/page.tsx");
    expect(src).toMatch(/<AppNav active="admin" \/>/);
  });

  it("is rendered on /admin/feedback", () => {
    const src = read("../app/admin/feedback/page.tsx");
    expect(src).toMatch(/<AppNav active="admin" \/>/);
  });
});
