import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Cadence wordmark. Plain text + coral accent dot after the wordmark.
 * Kept deliberately simple — no logo until the brand earns one.
 * (Note: the original brief asked for a dot on the "i" — "Cadence" has no
 * lowercase i, so the accent lands as a trailing brand dot instead.)
 */
export function Wordmark({ className, asLink = true }: { className?: string; asLink?: boolean }) {
  const inner = (
    <span className={cn("inline-flex items-baseline gap-0.5 text-base font-semibold tracking-tight", className)}>
      <span>Cadence</span>
      <span aria-hidden className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-brand" />
    </span>
  );
  if (!asLink) return inner;
  return (
    <Link
      href="/"
      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
      aria-label="Cadence — home"
    >
      {inner}
    </Link>
  );
}
