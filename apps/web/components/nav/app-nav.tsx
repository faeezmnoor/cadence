import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/marketing/wordmark";

export type AppNavTab =
  | "chat"
  | "briefs"
  // Legacy `spec` value kept so existing /spec callers still type-check.
  // The visible tab is now "Briefs" pointing at /briefs (multi-brief UX v1
  // §3 — "spec" becomes engineer-leakage and gets retired from the nav).
  | "spec"
  | "link"
  | "learning"
  | "billing"
  | "admin"
  | null;

type TabDef = {
  key: Exclude<AppNavTab, null>;
  label: string;
  href: string;
};

/**
 * Tabs the regular signed-in user sees. NOTE on copy:
 *   - "Delivery" not "Telegram". Cadence is messaging-channel-agnostic;
 *     Telegram is just today's live channel, WhatsApp is on the roadmap.
 *     See feedback_cadence_positioning. The /app/link page itself can
 *     reference Telegram concretely, but the global nav cannot.
 */
const TABS: TabDef[] = [
  { key: "chat", label: "Chat", href: "/chat" },
  // Multi-brief UX v1 §3: "Spec" is dead as a nav noun. The user-facing
  // word is "Briefs"; the surface lists all of a user's briefs (active +
  // paused). /spec still exists as a power-user JSON editor reachable
  // from the brief detail (CAD follow-up), but it is no longer a top-level
  // tab. We pass tab key "briefs" from /briefs and keep "spec" so the
  // legacy /spec page still renders an active tab when visited directly.
  { key: "briefs", label: "Briefs", href: "/briefs" },
  { key: "link", label: "Delivery", href: "/app/link" },
  // Stream E #4 — "What I've learned about you" surface (PM audit G3).
  { key: "learning", label: "Learning", href: "/settings/learning" },
  { key: "billing", label: "Billing", href: "/settings/billing" },
];

/**
 * Persistent top nav for authed routes (Designer #4, audit §1).
 *
 * Layout: wordmark (left) · tabs (center) · sign-out + theme toggle (right).
 *
 * Mobile (< sm): center tabs collapse to a horizontal scroll row beneath
 * the wordmark — half-day scope per the audit; a hamburger drawer is a
 * follow-up. Sign-out and theme toggle stay visible on the right.
 *
 * Active tab styling is server-rendered via the `active` prop. We don't
 * use `usePathname()` here because every authed page is a server component
 * that knows its own identity — keeps this a pure server component, zero
 * client JS for the shell.
 */
export function AppNav({ active }: { active: AppNavTab }) {
  return (
    <header className="safe-pt sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="safe-px mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={"/chat" as never}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Cadence — chat"
        >
          <Wordmark asLink={false} className="text-sm" />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden flex-1 justify-center gap-1 sm:flex"
        >
          {TABS.map((t) => {
            const isActive = t.key === active;
            return (
              <Link
                key={t.key}
                href={t.href as never}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "inline-flex h-9 items-center rounded-md bg-brand/15 px-3 text-sm font-semibold text-foreground"
                    : "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile tab row */}
      <nav
        aria-label="Primary (mobile)"
        className="safe-px flex gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:hidden"
      >
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href as never}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "inline-flex h-8 shrink-0 items-center rounded-md bg-brand/15 px-3 text-xs font-semibold text-foreground"
                  : "inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
