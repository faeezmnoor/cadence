import Link from "next/link";
import type { Route } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "./wordmark";

/**
 * Public marketing nav. Used on the landing page and all (marketing) routes.
 * Intentionally minimal — pricing + how-it-works on desktop, sign-in CTA always visible.
 */
export function MarketingNav() {
  return (
    <header className="flex items-center justify-between px-6 py-4 sm:px-10">
      <Wordmark />
      <nav className="flex items-center gap-1 sm:gap-2">
        <Link
          href={"/how-it-works" as Route}
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
        >
          How it works
        </Link>
        <Link
          href={"/pricing" as Route}
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
        >
          Pricing
        </Link>
        <Link
          href="/auth/sign-in"
          className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
