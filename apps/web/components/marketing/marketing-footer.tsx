import Link from "next/link";
import type { Route } from "next";
import { Wordmark } from "./wordmark";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/server/support/contact";

/**
 * Public marketing footer. Pricing/how-it-works/privacy/terms links + "Built in KL" line.
 */
export function MarketingFooter() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <p className="text-xs text-muted-foreground">
            Built in Kuala Lumpur by{" "}
            <a
              href="https://www.linkedin.com/in/faeezmnoor/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Faeez Noor
            </a>
            .
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link href={"/how-it-works" as Route} className="hover:text-foreground">
            How it works
          </Link>
          <Link href={"/pricing" as Route} className="hover:text-foreground">
            Pricing
          </Link>
          <Link href={"/privacy" as Route} className="hover:text-foreground">
            Privacy
          </Link>
          <Link href={"/terms" as Route} className="hover:text-foreground">
            Terms
          </Link>
          <a href={SUPPORT_MAILTO} className="hover:text-foreground">
            {SUPPORT_EMAIL}
          </a>
          <a
            href="https://www.linkedin.com/in/faeezmnoor/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
