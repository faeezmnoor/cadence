import { Lock, XCircle, Users, ShieldOff, BookOpen } from "lucide-react";

const items = [
  { icon: Lock, label: "Your data stays yours" },
  { icon: XCircle, label: "Cancel any time" },
  { icon: Users, label: "Made for SMEs" },
  { icon: ShieldOff, label: "No spam, ever" },
  { icon: BookOpen, label: "Sources cited in every brief" },
];

/**
 * Trust strip. Five pill badges, single row on desktop, wraps on mobile.
 * Lives below the sample-brief preview on the landing page.
 */
export function TrustStrip() {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      {items.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
