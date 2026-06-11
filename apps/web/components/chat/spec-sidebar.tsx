"use client";

/**
 * T-415 / CAD-75: Spec sidebar — "Your brief so far".
 *
 * Shows the live `chat_threads.draft_spec` as Cadence's running notes.
 * Desktop: right rail. Mobile: a <details> disclosure above the input.
 *
 * UX audit v3 (Wave B / §3): reframed from an engineer's field inspector
 * (mono values, "DRAFT", "— not set") into plain-language notes. The pure
 * row builder lives in a sibling .ts file (vitest imports it without React).
 *
 * Design-review 2026-06-11 FINDING-001: the desktop rail is collapsible.
 * At turn 0 it used to pin 320px of empty "—" rows to every wide viewport;
 * now it starts collapsed until the agent captures something, auto-opens on
 * first content, and a manual toggle (persisted in localStorage) always
 * wins over the automatic behaviour. SSR renders from the draft prop only
 * (deterministic); the stored preference is applied post-hydration.
 */
import { useEffect, useMemo, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  buildRows,
  hasDraftContent,
  isReady,
  resolveRailOpen,
  type DraftLike,
} from "./spec-sidebar.helpers";

export type { DraftLike };

const RAIL_PREF_KEY = "cadence.brief-rail";

export function SpecSidebar({
  draft,
  variant,
}: {
  draft: DraftLike;
  variant: "desktop" | "mobile";
}) {
  const rows = useMemo(() => buildRows(draft), [draft]);
  const ready = useMemo(() => isReady(draft), [draft]);
  const hasContent = useMemo(() => hasDraftContent(rows), [rows]);

  // null = no manual preference; the rail follows content. Stored manual
  // toggles are loaded after hydration so server and client first paint agree.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const stored = window.localStorage.getItem(RAIL_PREF_KEY);
    if (stored === "open") setManualOpen(true);
    if (stored === "closed") setManualOpen(false);
  }, []);

  const open = resolveRailOpen(manualOpen, hasContent);

  const setOpen = (next: boolean) => {
    setManualOpen(next);
    try {
      window.localStorage.setItem(RAIL_PREF_KEY, next ? "open" : "closed");
    } catch {
      /* private mode — preference just won't persist */
    }
  };

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

  if (!open) {
    return (
      <aside
        data-testid="spec-rail-collapsed"
        className="hidden w-12 shrink-0 flex-col items-center border-l border-border bg-card/30 pt-3 lg:flex"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Show your brief"
          aria-expanded="false"
          title="Show your brief"
          className="relative rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <PanelRightOpen className="h-4 w-4" aria-hidden />
          {ready && (
            <span
              aria-hidden
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-success"
            />
          )}
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="spec-rail-open"
      className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/30 lg:flex"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Your brief so far
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            I&rsquo;ll fill this in as we chat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide your brief"
          aria-expanded="true"
          title="Hide your brief"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <PanelRightClose className="h-4 w-4" aria-hidden />
        </button>
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
