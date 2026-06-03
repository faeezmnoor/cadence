"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";

type Row = {
  id: string;
  userId: string;
  version: number;
  isCurrent: boolean;
  createdVia: string;
  // T-306 (CAD-41): keep in sync with digest_specs.is_smoke schema column.
  isSmoke: boolean;
  // T-401 (CAD-42): keep in sync with digest_specs.keyboard_enabled.
  keyboardEnabled: boolean;
  // CAD-88: per-spec tier preference (default | pro). DB-constrained.
  tier: string;
  createdAt: Date;
  updatedAt: Date;
  spec: unknown;
};

export function SpecClient({
  initialCurrent,
  initialVersions,
  proTierAlphaEnabled = false,
}: {
  initialCurrent: Row | null;
  initialVersions: Pick<Row, "id" | "version" | "isCurrent" | "createdVia" | "createdAt">[];
  /** CAD-88: render the Pro toggle UI only when the alpha flag is on. */
  proTierAlphaEnabled?: boolean;
}) {
  const utils = trpc.useUtils();
  const currentQuery = trpc.digestSpec.getCurrent.useQuery(undefined, {
    // initialData on a query whose return type includes `null` trips a tRPC
    // overload — fall back to placeholderData which accepts the same shape
    // and still hydrates without a flash.
    placeholderData: initialCurrent ?? undefined,
  });
  const versionsQuery = trpc.digestSpec.listVersions.useQuery(undefined, {
    initialData: initialVersions,
  });
  const updateRaw = trpc.digestSpec.updateRaw.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.digestSpec.getCurrent.invalidate(), utils.digestSpec.listVersions.invalidate()]);
    },
  });
  const setTier = trpc.digestSpec.setTier.useMutation({
    onSuccess: async () => {
      await utils.digestSpec.getCurrent.invalidate();
    },
  });

  const current = currentQuery.data;
  const summary = useMemo(() => extractSummary(current?.spec), [current?.spec]);

  const [draft, setDraft] = useState<string>(() => JSON.stringify(current?.spec ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    const result = digestSpecSchema.safeParse(parsed);
    if (!result.success) {
      setError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      return;
    }
    updateRaw.mutate({
      spec: result.data,
      createdVia: "manual_edit",
      // CAD-88: preserve the existing tier on version bump. If the spec
      // hasn't been created yet, default to "default".
      tier: (current?.tier === "pro" ? "pro" : "default") as "default" | "pro",
    });
  }

  const tier = (current?.tier === "pro" ? "pro" : "default") as "default" | "pro";

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Your DigestSpec</h1>
        <p className="text-sm text-neutral-500">
          The configuration the composer uses to build your brief. Edit the raw JSON below, or update via chat.
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Summary</h2>
        {current ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {summary.map(([k, v]) => (
              <div key={k}>
                <dt className="text-neutral-500">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">No spec saved yet. Start a chat to configure one, or paste JSON below.</p>
        )}
      </section>

      {/* CAD-88: Pro / Default tier toggle. Only rendered when the alpha
          flag is on; otherwise the UI gives no hint Pro exists. */}
      {proTierAlphaEnabled && current && (
        <section
          aria-label="Tier"
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Research tier
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Default uses fast web search + a lightweight composer. Pro uses
            deep-research grounding and the Sonnet 4.6 composer — slower,
            sharper, costs 3 credits per brief.
          </p>
          <div className="mt-3 inline-flex rounded-md border border-neutral-300 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => setTier.mutate({ tier: "default" })}
              disabled={setTier.isPending || tier === "default"}
              className={`px-3 py-1.5 text-sm ${
                tier === "default"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-transparent text-neutral-700 dark:text-neutral-300"
              }`}
              aria-pressed={tier === "default"}
            >
              Default · 1 credit
            </button>
            <button
              type="button"
              onClick={() => setTier.mutate({ tier: "pro" })}
              disabled={setTier.isPending || tier === "pro"}
              className={`px-3 py-1.5 text-sm ${
                tier === "pro"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-transparent text-neutral-700 dark:text-neutral-300"
              }`}
              aria-pressed={tier === "pro"}
            >
              🔬 Pro · 3 credits
            </button>
          </div>
          {setTier.isSuccess && (
            <span className="ml-3 text-xs text-emerald-600">Saved.</span>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Raw JSON</h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="h-96 w-full rounded-md border border-neutral-300 bg-white p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
        />
        {error && <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">{error}</pre>}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={updateRaw.isPending}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {updateRaw.isPending ? "Saving…" : "Save new version"}
          </button>
          {updateRaw.isSuccess && <span className="text-xs text-emerald-600">Saved.</span>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">Versions</h2>
        <ul className="space-y-1 text-sm">
          {versionsQuery.data?.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <span>
                v{v.version} {v.isCurrent && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">current</span>}
              </span>
              <span className="text-xs text-neutral-500">
                {v.createdVia} · {new Date(v.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function extractSummary(spec: unknown): [string, string][] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as Partial<DigestSpecV1>;
  const rows: [string, string][] = [];
  if (s.topics?.length) rows.push(["Topics", s.topics.join(", ")]);
  if (s.entities?.companies?.length) rows.push(["Companies", s.entities.companies.join(", ")]);
  if (s.entities?.tickers?.length) rows.push(["Tickers", s.entities.tickers.join(", ")]);
  if (s.entities?.commodities?.length) rows.push(["Commodities", s.entities.commodities.join(", ")]);
  if (s.keywords_include?.length) rows.push(["Include", s.keywords_include.join(", ")]);
  if (s.keywords_exclude?.length) rows.push(["Exclude", s.keywords_exclude.join(", ")]);
  if (s.cadence?.frequency) rows.push(["Frequency", s.cadence.frequency]);
  if (s.cadence?.delivery_time_local) rows.push(["Delivery time", s.cadence.delivery_time_local]);
  if (s.cadence?.days_of_week?.length) rows.push(["Days", s.cadence.days_of_week.join(", ")]);
  if (s.tone_preset) rows.push(["Tone", s.tone_preset]);
  if (s.length_target) rows.push(["Length", s.length_target]);
  if (s.language) rows.push(["Language", s.language]);
  return rows;
}
