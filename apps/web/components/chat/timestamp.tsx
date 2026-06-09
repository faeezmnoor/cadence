"use client";

import { useEffect, useState } from "react";
import {
  formatChatTime,
  formatChatTimeAbsolute,
} from "@/lib/chat/format-time";

/**
 * Meta-row timestamp. Relative-or-short text; full absolute on hover and
 * via aria-label. Refreshes itself every 30s so "5m ago" stays accurate
 * without a full re-render of the message list.
 *
 * Mobile rule (blueprint §2.2): always-visible muted text — zero
 * discovery cost. Hover tooltip carries the full long-form for desktop.
 */
export function Timestamp({ at }: { at: Date }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const rel = formatChatTime(at);
  const abs = formatChatTimeAbsolute(at);

  return (
    <time
      dateTime={at.toISOString()}
      title={abs}
      aria-label={abs}
      className="tabular-nums"
    >
      {rel}
    </time>
  );
}
