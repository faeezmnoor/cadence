import { Lock, MessageSquare, Wallet, BookOpen } from "lucide-react";

const items = [
  { icon: BookOpen, label: "Sources cited in every brief" },
  { icon: MessageSquare, label: "One brief every morning — quiet days included" },
  { icon: Wallet, label: "No subscription — pay as you go" },
  { icon: Lock, label: "Your data stays yours" },
];

/**
 * Trust strip. Four pill badges, single row on desktop, wraps on mobile.
 * Lives below the sample-brief preview on the landing page. ("Cancel any
 * time" was cut in copy v3 — it contradicted the no-subscription model.)
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
