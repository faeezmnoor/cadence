"use client";

/**
 * T-415 / CAD-75: Spec sidebar — "Your brief so far".
 *
 * Shows the live `chat_threads.draft_spec` as Cadence's running notes.
 * Desktop: right rail. Mobile: a <details> disclosure above the input.
 *
 * UX audit v3 (Wave B / §3): reframed from an engineer's field inspector
 * (mono values, "DRAFT", "— not set") into plain-language notes — the
 * surface where the user watches their researcher understand them, so it
 * reads like a person taking notes, not a JSON debugger. The pure row
 * builder lives in a sibling .ts file (vitest imports it without React).
 */
import { useMemo } from "react";
import { buildRows, isReady, type DraftLike } from "./spec-sidebar.helpers";

export type { DraftLike };

export function SpecSidebar({
  draft,
  variant,
}: {
  draft: DraftLike;
  variant: "desktop" | "mobile";
}) {
  const rows = useMemo(() => buildRows(draft), [draft]);
  const ready = useMemo(() => isReady(draft), [draft]);

  const list = (
    <dl className="flex flex-col gap-2.5 text-sm">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-3"
        >
          <dt className="shrink-0 text-xs text-muted-foreground">
            {r.label}
          </dt>
          <dd
            className={
              r.value
                ? "max-w-[60%] truncate text-right text-sm text-foreground"
                : "text-right text-sm text-muted-foreground/50"
            }
            title={r.value ?? undefined}
          >
            {r.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (variant === "mobile") {
    return (
      <details className="mx-auto w-full max-w-2xl rounded-md border border-border bg-card px-3 py-2 text-sm lg:hidden">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
          {ready ? "Your brief — ready to confirm ✓" : "Your brief so far"}
        </summary>
        <div className="mt-3">{list}</div>
      </details>
    );
  }

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/30 lg:flex">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Your brief so far</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          I&rsquo;ll fill this in as we chat.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{list}</div>
      <div className="border-t border-border px-5 py-3">
        {ready ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <span aria-hidden>✓</span> Ready to confirm
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            Still listening…
          </span>
        )}
      </div>
    </aside>
  );
}
