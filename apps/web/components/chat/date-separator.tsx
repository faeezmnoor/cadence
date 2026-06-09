"use client";

import { formatDateSeparator } from "@/lib/chat/format-time";

/**
 * Date-boundary divider chip between message groups on different days.
 *
 * Blueprint §2.2: aria-hidden flanking rules + readable label between.
 */
export function DateSeparator({ at }: { at: Date }) {
  const label = formatDateSeparator(at);
  return (
    <div
      role="separator"
      aria-label={label}
      className="my-1 flex items-center gap-3 text-[11px] text-muted-foreground"
    >
      <hr aria-hidden="true" className="flex-1 border-border" />
      <span className="px-1 font-medium">{label}</span>
      <hr aria-hidden="true" className="flex-1 border-border" />
    </div>
  );
}
