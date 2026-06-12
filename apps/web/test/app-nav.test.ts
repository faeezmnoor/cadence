/**
 * Designer #4 (design-audit-v1 §1) + settings-surfacing v1 §1: persistent
 * top nav after auth.
 *
 * Pins:
 *   - tabs: Chat / Briefs / Delivery / Settings (NOT "Telegram" — see
 *     feedback_cadence_positioning; Cadence is channel-agnostic).
 *   - Settings-surfacing v1: Learning and Billing left the top nav and
 *     fold into the /settings hub as cards (design-audit §C1 ratified;
 *     4 tabs fit a 320px phone, 6 guaranteed horizontal scroll). Their
 *     pages stay live and render with the Settings tab active.
 *   - Admin tab renders only when the server page passes isAdmin (zero-JS
 *     server component constraint preserved — no usePathname).
 *   - wordmark links to /chat
 *   - sign-out form posts to /auth/sign-out
 *   - mounted on chat / briefs / settings / admin routes
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const navSource = read("../components/nav/app-nav.tsx");

describe("AppNav (Designer #4 + settings-surfacing v1)", () => {
  it("declares the four user-facing tabs with the correct hrefs", () => {
    expect(navSource).toMatch(/label:\s*"Chat",\s*href:\s*"\/chat"/);
    expect(navSource).toMatch(/label:\s*"Briefs",\s*href:\s*"\/briefs"/);
    expect(navSource).toMatch(/label:\s*"Delivery",\s*href:\s*"\/app\/link"/);
    expect(navSource).toMatch(/label:\s*"Settings",\s*href:\s*"\/settings"/);
  });

  it("does NOT declare Learning or Billing as top-level tabs (hub IA)", () => {
    expect(navSource).not.toMatch(/label:\s*"Learning"/);
    expect(navSource).not.toMatch(/label:\s*"Billing"/);
  });

  it("declares the founder-only Admin tab pointing at /admin, gated on isAdmin", () => {
    expect(navSource).toMatch(/label:\s*"Admin",\s*href:\s*"\/admin"/);
    expect(navSource).toMatch(/isAdmin \? \[\.\.\.TABS, ADMIN_TAB\] : TABS/);
  });

  it("stays a zero-JS server component (no usePathname import, no use client)", () => {
    // The component's own comment NAMES usePathname while explaining why
    // it's avoided — assert against the import, not the mention.
    expect(navSource).not.toMatch(/import[^;]*usePathname/);
    expect(navSource).not.toMatch(/"use client"/);
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
    expect(src).toMatch(/<AppNav active="chat"/);
  });

  it("is rendered on /briefs", () => {
    const src = read("../app/briefs/page.tsx");
    expect(src).toMatch(/import \{ AppNav \} from/);
    expect(src).toMatch(/<AppNav active="briefs"/);
  });

  it("is rendered on /briefs/[id] (per-brief detail; tab highlights Briefs)", () => {
    const src = read("../app/briefs/[id]/page.tsx");
    expect(src).toMatch(/<AppNav active="briefs"/);
  });

  it("/spec page is a redirect to /briefs (legacy bookmark compat)", () => {
    const src = read("../app/spec/page.tsx");
    expect(src).toMatch(/redirect\(["']\/briefs["']/);
  });

  it("is rendered on /app/link", () => {
    const src = read("../app/app/link/page.tsx");
    expect(src).toMatch(/<AppNav active="link"/);
  });

  it("settings hub + children all light the Settings tab (section = active)", () => {
    expect(read("../app/settings/page.tsx")).toMatch(
      /<AppNav active="settings"/
    );
    expect(read("../app/settings/billing/page.tsx")).toMatch(
      /<AppNav active="settings"/
    );
    expect(read("../app/settings/learning/page.tsx")).toMatch(
      /<AppNav active="settings"/
    );
    expect(read("../app/settings/danger/page.tsx")).toMatch(
      /<AppNav active="settings"/
    );
  });

  it("settings children carry a ← Settings back-link to the hub", () => {
    for (const page of [
      "../app/settings/billing/page.tsx",
      "../app/settings/learning/page.tsx",
      "../app/settings/danger/page.tsx",
    ]) {
      expect(read(page)).toMatch(/← Settings/);
    }
  });

  it("is rendered on the /admin index hub", () => {
    const src = read("../app/admin/page.tsx");
    expect(src).toMatch(/<AppNav active="admin" isAdmin \/>/);
    expect(src).toMatch(/isAdminEmail/);
  });

  it("is rendered on /admin/runs", () => {
    const src = read("../app/admin/runs/page.tsx");
    expect(src).toMatch(/<AppNav active="admin"/);
  });

  it("is rendered on /admin/feedback", () => {
    const src = read("../app/admin/feedback/page.tsx");
    expect(src).toMatch(/<AppNav active="admin"/);
  });
});
