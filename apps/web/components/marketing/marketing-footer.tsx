import Link from "next/link";
import type { Route } from "next";
import { Wordmark } from "./wordmark";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/server/support/contact";

/**
 * Public marketing footer. Pricing/how-it-works/privacy/terms links + tagline.
 */
export function MarketingFooter() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <p className="text-xs text-muted-foreground">
            Your own researcher, every morning.
          </p>
        </div>
        {/* Design-review 2026-06-11 FINDING-004: these links had no
            focus-visible style and ~16px hit areas; same destinations in the
            header nav get both. -mx/my offsets keep visual alignment while
            the padding grows the target. */}
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Link
            href={"/how-it-works" as Route}
            className="-my-1.5 rounded-md px-1.5 py-2.5 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            How it works
          </Link>
          <Link
            href={"/pricing" as Route}
            className="-my-1.5 rounded-md px-1.5 py-2.5 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            Pricing
          </Link>
          <Link
            href={"/privacy" as Route}
            className="-my-1.5 rounded-md px-1.5 py-2.5 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            Privacy
          </Link>
          <Link
            href={"/terms" as Route}
            className="-my-1.5 rounded-md px-1.5 py-2.5 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            Terms
          </Link>
          <a
            href={SUPPORT_MAILTO}
            className="-my-1.5 rounded-md px-1.5 py-2.5 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            {SUPPORT_EMAIL}
          </a>
        </nav>
      </div>
    </footer>
  );
}
