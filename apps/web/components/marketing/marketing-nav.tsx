"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "./wordmark";

/**
 * Public marketing nav. Used on the landing page and all (marketing) routes.
 * Intentionally minimal — pricing + how-it-works on desktop, sign-in CTA
 * always visible.
 *
 * Design-review 2026-06-11 FINDING-003 (trunk test): the nav gave no
 * "you are here" signal — on /pricing the Pricing link looked identical to
 * its siblings. Client component so usePathname can mark the current page
 * with the same active treatment the app nav uses (bg-brand/15), keeping
 * one wayfinding language across marketing and product.
 */
const LINKS: Array<{ href: Route; label: string }> = [
  { href: "/how-it-works" as Route, label: "How it works" },
  { href: "/pricing" as Route, label: "Pricing" },
];

export function MarketingNav() {
  const pathname = usePathname();
  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-10">
      <Wordmark />
      <nav className="flex items-center gap-1 sm:gap-2">
        {LINKS.map((l) => {
          const isActive = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "hidden rounded-md bg-brand/15 px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:inline-flex"
                  : "hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:inline-flex"
              }
            >
              {l.label}
            </Link>
          );
        })}
        <Link
          href="/auth/sign-in"
          className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          Sign in
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
