import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export type AppNavTab = "chat" | "spec" | "link" | "admin" | null;

type TabDef = {
  key: Exclude<AppNavTab, null>;
  label: string;
  href: string;
};

const TABS: TabDef[] = [
  { key: "chat", label: "Chat", href: "/chat" },
  { key: "spec", label: "Spec", href: "/spec" },
  { key: "link", label: "Telegram", href: "/app/link" },
];

/**
 * Persistent top nav for authed routes (Designer #4, audit §1).
 *
 * Layout: wordmark (left) · tabs (center) · sign-out + theme toggle (right).
 *
 * Mobile: tabs collapse to a single horizontal scroll row beneath the
 * wordmark — half-day scope per the audit; a real hamburger drawer is a
 * follow-up. Sign-out and theme toggle stay visible on the right.
 *
 * Active tab styling is server-rendered via the `active` prop. We don't
 * use `usePathname()` here because every authed page is a server component
 * that knows its own identity — keeps this a pure server component, zero
 * client JS for the shell.
 *
 * Billing is intentionally omitted (no billing route exists yet — adding a
 * dead tab would be worse than no tab; ship when the page lands).
 */
export function AppNav({ active }: { active: AppNavTab }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={"/chat" as never}
          className="text-base font-semibold tracking-tight text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-sm"
        >
          Cadence
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
                    ? "inline-flex h-9 items-center rounded-md bg-muted px-3 text-sm font-medium text-foreground"
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
        className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:hidden"
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
                  ? "inline-flex h-8 shrink-0 items-center rounded-md bg-muted px-3 text-xs font-medium text-foreground"
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
