"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";

type Row = {
  id: string;
  version: number;
  isCurrent: boolean;
  createdVia: string;
  createdAt: Date;
  spec?: unknown;
};

export function SpecClient({
  initialCurrent,
  initialVersions,
}: {
  initialCurrent: Row | null;
  initialVersions: Pick<Row, "id" | "version" | "isCurrent" | "createdVia" | "createdAt">[];
}) {
  const utils = trpc.useUtils();
  const currentQuery = trpc.digestSpec.getCurrent.useQuery(undefined, {
    initialData: initialCurrent as Row | null,
  });
  const versionsQuery = trpc.digestSpec.listVersions.useQuery(undefined, {
    initialData: initialVersions,
  });
  const updateRaw = trpc.digestSpec.updateRaw.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.digestSpec.getCurrent.invalidate(), utils.digestSpec.listVersions.invalidate()]);
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
    updateRaw.mutate({ spec: result.data, createdVia: "manual_edit" });
  }

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
