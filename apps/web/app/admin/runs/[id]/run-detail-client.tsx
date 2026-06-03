"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * Evals Phase 0 — per-run viewer client.
 *
 * Behaviour:
 *   - Loads `admin.getRun` for the row id from the URL.
 *   - If `metadata.manualRating` exists, the form is pre-populated and we
 *     show "Previously rated by … at …" — explicit that submitting will
 *     overwrite. Founder asked: don't silently overwrite.
 *   - Submit calls `admin.rateBrief`. On success we invalidate the query
 *     so the prior-rating banner reflects the new value.
 *
 * Source resolve table reads `metadata.sourceResolve` — produced by the
 * digest pipeline post-compose. If absent (legacy row), we show
 * "not checked" so the admin knows the eval signal isn't available.
 */
interface SourceResolveRow {
  url: string;
  status: number;
  resolved: boolean;
  latencyMs: number;
  error?: string;
}
interface SourceResolveMeta {
  rate: number;
  results: SourceResolveRow[];
  checkedAt: string;
}
interface ManualRating {
  grounding: number;
  specificity: number;
  fit: number;
  notes?: string;
  ratedAt: string;
  ratedBy: string;
}
interface RunMetadata {
  sourceResolve?: SourceResolveMeta;
  manualRating?: ManualRating;
}

export function RunDetailClient({
  runId,
  adminEmail,
}: {
  runId: string;
  adminEmail: string;
}) {
  const utils = trpc.useUtils();
  const query = trpc.admin.getRun.useQuery({ runId });

  const meta: RunMetadata = useMemo(() => {
    const raw = query.data?.metadata;
    return (raw && typeof raw === "object" ? (raw as RunMetadata) : {}) as RunMetadata;
  }, [query.data]);

  const prior = meta.manualRating;

  const [grounding, setGrounding] = useState<number>(3);
  const [specificity, setSpecificity] = useState<number>(3);
  const [fit, setFit] = useState<number>(3);
  const [notes, setNotes] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  // Hydrate form when prior rating loads. We do it in an effect so the
  // user can still edit freely once the page is interactive.
  useEffect(() => {
    if (!prior) return;
    setGrounding(prior.grounding);
    setSpecificity(prior.specificity);
    setFit(prior.fit);
    setNotes(prior.notes ?? "");
  }, [prior]);

  const rateMutation = trpc.admin.rateBrief.useMutation({
    onSuccess: async () => {
      setToast("Rating saved.");
      await utils.admin.getRun.invalidate({ runId });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      setToast(`Save failed: ${err.message}`);
      setTimeout(() => setToast(null), 5000);
    },
  });

  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Loading run…</p>
      </main>
    );
  }
  if (query.isError || !query.data) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-red-600">
          Failed to load run: {query.error?.message ?? "unknown"}
        </p>
        <Link
          href="/admin/runs"
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          ← back to runs
        </Link>
      </main>
    );
  }

  const run = query.data;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/runs"
            className="text-sm text-blue-600 hover:underline"
          >
            ← back
          </Link>
          <h1 className="text-2xl font-semibold">Run · {runId.slice(0, 8)}</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          {run.userEmail} · spec v{run.specVersion}
          {run.specIsSmoke ? " · 🧪 smoke" : ""} · status{" "}
          <span className="font-mono">{run.status}</span> · admin {adminEmail}
        </p>
      </header>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900"
        >
          {toast}
        </div>
      ) : null}

      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Brief</h2>
        {run.composedMarkdown ? (
          <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-800">
            {run.composedMarkdown}
          </pre>
        ) : run.userDeletedAt ? (
          <p className="text-sm italic text-amber-700">
            Brief content removed per PDPA deletion (owner soft-deleted on{" "}
            {new Date(run.userDeletedAt).toISOString().slice(0, 10)}).
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No composed markdown on this row (may be a pre-compose failure).
          </p>
        )}
      </section>

      <SourceResolveTable resolve={meta.sourceResolve} />

      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">
            Manual rating
          </h2>
          {prior ? (
            <p
              className="text-xs text-amber-700"
              title={`Submitting will overwrite the prior rating from ${prior.ratedBy} at ${prior.ratedAt}.`}
            >
              Previously rated by {prior.ratedBy} ·{" "}
              {formatRelative(prior.ratedAt)} — saving will overwrite.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <RatingSlider
            label="Grounding"
            help="Brief sticks to what sources say."
            value={grounding}
            onChange={setGrounding}
          />
          <RatingSlider
            label="Specificity"
            help="Concrete numbers, places, dates — not vibes."
            value={specificity}
            onChange={setSpecificity}
          />
          <RatingSlider
            label="Fit"
            help="Right industry / right reader."
            value={fit}
            onChange={setFit}
          />
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-neutral-700">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="What stood out? What would push this to a 5?"
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() =>
            rateMutation.mutate({
              runId,
              grounding,
              specificity,
              fit,
              notes: notes.trim() || undefined,
            })
          }
          disabled={rateMutation.isPending}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rateMutation.isPending
            ? "Saving…"
            : prior
            ? "Update rating"
            : "Submit rating"}
        </button>
      </section>
    </main>
  );
}

function RatingSlider({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-neutral-900">
          {value}/5
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="w-full"
      />
      <span className="text-[11px] text-neutral-500">{help}</span>
    </label>
  );
}

function SourceResolveTable({ resolve }: { resolve: SourceResolveMeta | undefined }) {
  if (!resolve) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Sources</h2>
        <p className="text-sm text-muted-foreground italic">
          Source-resolve check not run for this row (pre-Phase-0 backfill).
        </p>
      </section>
    );
  }
  const ratePct = Math.round(resolve.rate * 100);
  const cls =
    resolve.rate >= 0.9
      ? "text-emerald-700"
      : resolve.rate >= 0.8
      ? "text-blue-700"
      : "text-red-700";
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Sources</h2>
        <span className={`text-xs font-medium ${cls}`}>
          {resolve.results.filter((r) => r.resolved).length}/
          {resolve.results.length} resolved · {ratePct}%
        </span>
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-neutral-500">
          <tr>
            <th className="py-1 pr-2 font-medium">OK</th>
            <th className="py-1 pr-2 font-medium">Status</th>
            <th className="py-1 pr-2 font-medium">Latency</th>
            <th className="py-1 font-medium">URL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {resolve.results.map((r, i) => (
            <tr key={`${r.url}-${i}`}>
              <td className="py-1 pr-2">
                {r.resolved ? (
                  <span title="2xx/3xx" className="text-emerald-600">
                    ✅
                  </span>
                ) : (
                  <span title={r.error ?? `HTTP ${r.status}`} className="text-red-600">
                    ❌
                  </span>
                )}
              </td>
              <td className="py-1 pr-2 font-mono tabular-nums text-neutral-700">
                {r.status === 0 ? r.error ?? "err" : r.status}
              </td>
              <td className="py-1 pr-2 font-mono tabular-nums text-neutral-500">
                {r.latencyMs}ms
              </td>
              <td className="py-1 truncate text-neutral-700" title={r.url}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {r.url}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}
