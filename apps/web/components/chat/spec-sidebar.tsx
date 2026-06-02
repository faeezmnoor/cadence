"use client";

/**
 * T-415 / CAD-75: Spec sidebar.
 *
 * Shows the live `chat_threads.draft_spec` as a 6-row card. Desktop: right
 * rail. Mobile: a <details> disclosure above the input. Pure helpers live
 * in a sibling .ts file so vitest can import them without dragging the
 * React TSX through vite's transformer.
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
          <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
            {r.label}
          </dt>
          <dd
            className={
              r.value
                ? "max-w-[60%] truncate text-right font-mono text-xs"
                : "text-right font-mono text-xs text-muted-foreground/70"
            }
            title={r.value ?? undefined}
          >
            {r.value ?? "— not set"}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (variant === "mobile") {
    return (
      <details className="mx-auto w-full max-w-2xl rounded-md border border-border bg-card px-3 py-2 text-sm lg:hidden">
        <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {ready ? "Captured · ✓ ready to confirm" : "Captured so far"}
        </summary>
        <div className="mt-3">{list}</div>
      </details>
    );
  }

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/30 lg:flex">
      <div className="border-b border-border px-5 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Draft
        </p>
        <h2 className="text-sm font-semibold tracking-tight">Captured so far</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{list}</div>
      <div className="border-t border-border px-5 py-3">
        {ready ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
            <span aria-hidden>✓</span> Ready to confirm
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            Filling in…
          </span>
        )}
      </div>
    </aside>
  );
}
