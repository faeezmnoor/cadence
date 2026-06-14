"use client";

/**
 * /briefs client — cards + pause/resume/archive interactivity.
 *
 * Per multi-brief UX v1 §6:
 *   - Card per brief (full bleed on mobile, two-up at sm+).
 *   - Sort: active by next delivery ascending; paused sinks to bottom.
 *   - Status badge (Active / Paused) — text + color, never color-only.
 *   - Pause / Resume toggle button per card.
 *   - Archive with confirm (inline reveal, NOT window.confirm — that
 *     pattern was flagged in design-audit v2).
 *   - "+ New brief" CTA at top, routing through /chat (the new-brief
 *     authoring path). Disabled with tooltip when canCreate.allowed=false.
 *   - Empty state with CTA → /chat.
 *
 * Design tokens only — no raw neutral or raw hex per UX audit lessons.
 * Mobile-first at 390x844; cards stack and the sticky top stays visible.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { isAdvancedStack, normalizeStack } from "@/lib/research-stack";

export type BriefRow = {
  id: string;
  name: string | null;
  status: string;
  tier: string;
  scheduling: unknown;
  spec: unknown;
  nextRunAt: string | null;
  pausedAt: string | null;
  createdAt: string;
  lastRun: {
    shortId: string | null;
    status: string;
    runDate: string;
    createdAt: string;
  } | null;
};

type CanCreate = { allowed: boolean; count: number; max: number };

export function BriefsClient({
  initial,
  initialCanCreate,
}: {
  initial: BriefRow[];
  initialCanCreate: CanCreate;
}) {
  const utils = trpc.useUtils();
  const listQuery = trpc.briefs.list.useQuery(undefined, {
    initialData: initial as never,
  });
  const canCreateQuery = trpc.briefs.canCreate.useQuery(undefined, {
    initialData: initialCanCreate,
  });

  const refresh = async () => {
    await Promise.all([
      utils.briefs.list.invalidate(),
      utils.briefs.canCreate.invalidate(),
    ]);
  };

  const pause = trpc.briefs.pause.useMutation({ onSuccess: refresh });
  const resume = trpc.briefs.resume.useMutation({ onSuccess: refresh });
  const archive = trpc.briefs.archive.useMutation({ onSuccess: refresh });

  // Normalize whatever shape the query returned into our local Row type.
  // tRPC infers Date for the timestamp columns when called from the
  // client (the serializer turns them back into JS Dates), but our
  // initial server payload is ISO strings. We coerce here so the UI is
  // shape-agnostic.
  const rows: BriefRow[] = useMemo(() => {
    const data = (listQuery.data ?? []) as unknown[];
    return data.map((r) => {
      const row = r as Record<string, unknown>;
      const last = row.lastRun as Record<string, unknown> | null;
      return {
        id: String(row.id),
        name: (row.name as string | null) ?? null,
        status: String(row.status ?? "active"),
        tier: String(row.tier ?? "default"),
        scheduling: row.scheduling,
        spec: row.spec,
        nextRunAt: row.nextRunAt
          ? toIso(row.nextRunAt)
          : null,
        pausedAt: row.pausedAt ? toIso(row.pausedAt) : null,
        createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
        lastRun: last
          ? {
              shortId: (last.shortId as string | null) ?? null,
              status: String(last.status ?? ""),
              runDate: toIso(last.runDate) ?? "",
              createdAt: toIso(last.createdAt) ?? "",
            }
          : null,
      };
    });
  }, [listQuery.data]);

  // Sort: active first (by next delivery asc, NULL last), then paused
  // (by paused_at desc so freshly-paused are on top of the muted block).
  const sorted = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const paused = rows.filter((r) => r.status === "paused");
    active.sort((a, b) => {
      if (a.nextRunAt && b.nextRunAt) return a.nextRunAt.localeCompare(b.nextRunAt);
      if (a.nextRunAt) return -1;
      if (b.nextRunAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    paused.sort((a, b) => (b.pausedAt ?? "").localeCompare(a.pausedAt ?? ""));
    return [...active, ...paused];
  }, [rows]);

  const canCreate = canCreateQuery.data ?? initialCanCreate;
  const isEmpty = sorted.length === 0;

  return (
    <main className="safe-pb mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Your briefs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each brief is an ongoing research thread. You set the topic, language, and schedule — Cadence delivers it.
          </p>
        </div>
        <NewBriefButton canCreate={canCreate} />
      </header>

      {!isEmpty && <PortfolioBurnCard />}

      {isEmpty ? <EmptyState canCreate={canCreate} /> : null}

      {!isEmpty && (
        <>
          <p className="text-xs text-muted-foreground">
            {/*
             * Wave 4 Bug 8 fix: render count from the actual sorted list,
             * not from the separate canCreate query. The two used to drift
             * apart whenever the queries hydrated at different times,
             * surfacing as a "1 of 5" mismatch even though the page
             * rendered multiple cards.
             */}
            {sorted.length} of {canCreate.max}{" "}
            {canCreate.max === 1 ? "brief" : "briefs"} · sorted by next delivery
          </p>
          <ul className="space-y-3">
            {sorted.map((b) => (
              <BriefCard
                key={b.id}
                row={b}
                onPause={() => pause.mutate({ id: b.id })}
                onResume={() => resume.mutate({ id: b.id })}
                onArchive={() => archive.mutate({ id: b.id })}
                busy={
                  (pause.isPending && pause.variables?.id === b.id) ||
                  (resume.isPending && resume.variables?.id === b.id) ||
                  (archive.isPending && archive.variables?.id === b.id)
                }
              />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function NewBriefButton({ canCreate }: { canCreate: CanCreate }) {
  if (!canCreate.allowed) {
    // CAD-212: the cap is 1 brief while multi-brief is gated — say so
    // honestly instead of implying that archiving frees up a slot ladder.
    return (
      <span
        title="Multiple briefs are coming soon."
        className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-muted-foreground"
        aria-disabled="true"
      >
        + New brief
      </span>
    );
  }
  return (
    <Link
      href={"/chat" as never}
      className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground transition hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
    >
      + New brief
    </Link>
  );
}

function EmptyState({ canCreate }: { canCreate: CanCreate }) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-card-foreground">
      <h2 className="text-lg font-medium text-foreground">No briefs yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Tell Cadence what to track — an industry, a ticker, a route, anything — and we&apos;ll deliver a brief on your schedule.
      </p>
      <div className="mt-5">
        <NewBriefButton canCreate={canCreate} />
      </div>
    </section>
  );
}

function BriefCard({
  row,
  onPause,
  onResume,
  onArchive,
  busy,
}: {
  row: BriefRow;
  onPause: () => void;
  onResume: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const [archiving, setArchiving] = useState(false);
  const isPaused = row.status === "paused";

  const topics = useMemo(() => extractTopics(row.spec), [row.spec]);
  const scheduleLabel = useMemo(
    () => humanizeSchedule(row.scheduling),
    [row.scheduling]
  );
  const nextDelivery = useMemo(
    () => (row.nextRunAt ? formatNext(row.nextRunAt) : null),
    [row.nextRunAt]
  );
  const lastDelivery = useMemo(
    () => (row.lastRun ? formatLast(row.lastRun.runDate) : null),
    [row.lastRun]
  );
  const displayName = row.name?.trim() || (topics[0] ? `${capitalize(topics[0])} brief` : "Untitled brief");

  return (
    <li
      className={
        "rounded-xl border border-border bg-card p-4 text-card-foreground transition" +
        (isPaused ? " opacity-75" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-medium text-foreground">{displayName}</h3>
            <StatusBadge status={row.status} />
            {/* CAD-225: badge any ADVANCED stack via the registry helper, not
                a raw `=== "pro"` check. Post-retirement the real advanced
                stack is pro_websearch; normalizeStack folds the retired 'pro'
                to 'default' so a legacy spec stops badging (it now serves
                standard). The old `=== "pro"` predicate badged the retired
                stack and missed pro_websearch entirely. */}
            {isAdvancedStack(normalizeStack(row.tier)) ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                🔬 Advanced
              </span>
            ) : null}
          </div>
          {topics.length > 0 ? (
            <p className="mt-1 truncate text-sm text-muted-foreground" title={topics.join(" · ")}>
              {topics.slice(0, 5).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Schedule</dt>
          <dd className="text-foreground">{scheduleLabel}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {isPaused ? "Paused" : "Next delivery"}
          </dt>
          <dd className="text-foreground">
            {isPaused
              ? row.pausedAt
                ? `since ${formatRelativeDate(row.pausedAt)}`
                : "paused"
              : nextDelivery ?? "—"}
          </dd>
        </div>
        {lastDelivery ? (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Last delivered</dt>
            <dd className="text-foreground">
              {lastDelivery}
              {row.lastRun?.shortId ? (
                <>
                  {" · "}
                  <a
                    className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                    href={`/b/${row.lastRun.shortId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    open
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isPaused ? (
          <button
            type="button"
            onClick={onResume}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={onPause}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
          >
            Pause
          </button>
        )}

        {archiving ? (
          <span className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Archive this brief?
            <button
              type="button"
              onClick={() => {
                setArchiving(false);
                onArchive();
              }}
              disabled={busy}
              className="inline-flex h-7 items-center rounded-md bg-destructive px-2 text-xs font-medium text-destructive-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
            >
              Yes, archive
            </button>
            <button
              type="button"
              onClick={() => setArchiving(false)}
              className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setArchiving(true)}
            className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            Archive
          </button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
      Active
    </span>
  );
}

/**
 * Phase B T3 — portfolio burn-rate card.
 *
 * Header strip above the brief list, summarizing the user's aggregate
 * delivery rate across active briefs and how many days of runway the
 * current credit balance buys. Click-through to /settings/billing for
 * top-up. Mobile-responsive: stacks under 640px, side-by-side at sm+.
 *
 * Rendering rules:
 *   - hidden while loading (no skeleton flash; the list above carries
 *     the visual weight),
 *   - hidden on hard error (never block the list),
 *   - dampened message when zero active briefs contribute (every brief
 *     paused) instead of "Infinity days of runway",
 *   - runway color is text-only — "low" copy when ≤7 days; we don't
 *     color-only encode (a11y).
 */
function PortfolioBurnCard() {
  const burn = trpc.briefs.portfolioBurn.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  if (burn.isLoading || burn.isError) return null;
  const data = burn.data;
  if (!data) return null;
  const noBurn = data.creditsPerDay <= 0;
  const runwayLabel = (() => {
    if (noBurn) return "no scheduled briefs";
    const d = data.runwayDays ?? 0;
    if (d <= 0) return "0 days";
    if (d < 1) return "<1 day";
    if (d > 365) return ">1 year";
    return `${Math.floor(d)} day${Math.floor(d) === 1 ? "" : "s"}`;
  })();
  const isLow = !noBurn && (data.runwayDays ?? 0) <= 7;

  return (
    <section
      data-testid="portfolio-burn-card"
      aria-label="Usage & balance"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-6">
          <Stat
            label="Briefs / day"
            value={formatRate(data.briefsPerDay)}
            sub={`${data.activeCount} active`}
          />
          <Stat
            label="Credits / day"
            value={formatRate(data.creditsPerDay)}
            sub="1 credit standard · 3–5 credits advanced"
          />
          <Stat
            label="Balance"
            value={`${data.creditsBalance}`}
            sub="credits"
          />
          <Stat
            label="Lasts about"
            value={runwayLabel}
            sub={isLow ? "running low — top up" : undefined}
            emphasize={isLow}
          />
        </div>
        <a
          href="/settings/billing"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          Top up
        </a>
      </div>
      {data.skipped > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {data.skipped} brief{data.skipped === 1 ? "" : "s"} skipped (invalid schedule).
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "text-base font-medium tabular-nums " +
          (emphasize ? "text-foreground" : "text-foreground")
        }
      >
        {value}
      </span>
      {sub ? (
        <span
          className={
            "text-[11px] " +
            (emphasize ? "text-foreground" : "text-muted-foreground")
          }
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function formatRate(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 10) return n.toFixed(0);
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(2);
}

/* ---------------------------- formatters ---------------------------- */

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  // tRPC superjson can hand back {json: "..."} or a raw value depending on
  // transformer settings — be defensive.
  return null;
}

function extractTopics(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as { topics?: unknown };
  if (!Array.isArray(s.topics)) return [];
  return s.topics.filter((t): t is string => typeof t === "string");
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function humanizeSchedule(rule: unknown): string {
  if (!rule || typeof rule !== "object") return "Schedule not set";
  const r = rule as {
    cadence?: { kind?: string; weekdays?: number[]; monthlyDay?: number | "last"; cronExpr?: string };
    timeLocal?: string;
    timezone?: string;
  };
  const time = r.timeLocal ?? "";
  const tz = r.timezone ?? "";
  const tzLabel = tz ? ` (${tz})` : "";
  const c = r.cadence;
  if (!c) return "Schedule not set";

  if (c.kind === "daily") {
    const wd = c.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
    if (wd.length === 7) return `Daily at ${time}${tzLabel}`;
    if (wd.length === 5 && wd.every((d, i) => d === i + 1))
      return `Weekdays at ${time}${tzLabel}`;
    return `${wd.map((d) => DAY_NAMES[d]).join(", ")} at ${time}${tzLabel}`;
  }
  if (c.kind === "weekly") {
    const wd = c.weekdays ?? [];
    return `Weekly · ${wd.map((d) => DAY_NAMES[d]).join(", ")} at ${time}${tzLabel}`;
  }
  if (c.kind === "monthly") {
    const day = c.monthlyDay === "last" ? "last day" : `day ${c.monthlyDay}`;
    return `Monthly on ${day} at ${time}${tzLabel}`;
  }
  if (c.kind === "custom_cron") {
    return `Custom: ${c.cronExpr}${tzLabel}`;
  }
  return "Schedule not set";
}

function formatNext(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const diffMin = Math.round(diffMs / 60_000);
  const abs = d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diffMin < 0) return `${abs} (overdue)`;
  if (diffMin < 60) return `in ${diffMin}m · ${abs}`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `in ${diffH}h · ${abs}`;
  const diffD = Math.round(diffH / 24);
  return `in ${diffD}d · ${abs}`;
}

function formatLast(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
