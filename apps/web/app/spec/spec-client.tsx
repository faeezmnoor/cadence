"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";
import { TierExplainer } from "@/components/billing/tier-explainer";

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
        <h1 className="text-2xl font-semibold tracking-tight">Your brief setup</h1>
        <p className="text-sm text-muted-foreground">
          What Cadence researches for you each morning. Tweak it from chat, or edit the raw JSON below.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</h2>
        {current ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {summary.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing here yet. Tell Cadence what to watch from chat — or paste raw JSON below.</p>
        )}
      </section>

      {/* CAD-88: Pro / Default tier toggle. Only rendered when the alpha
          flag is on; otherwise the UI gives no hint Pro exists. */}
      {proTierAlphaEnabled && current && (
        <section
          aria-label="Tier"
          className="rounded-xl border border-border bg-card p-4 text-card-foreground"
        >
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Research tier
            {/* CAD-96: native <details> tooltip. Click-to-open avoids the
                hover-only a11y trap and works on touch. */}
            <details className="group relative inline-block normal-case [&_summary::-webkit-details-marker]:hidden">
              <summary
                aria-label="What's the difference between Default and Pro?"
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-border text-[10px] font-normal text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                ?
              </summary>
              <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-md border border-border bg-card p-3 text-card-foreground shadow-md">
                <TierExplainer variant="compact" />
              </div>
            </details>
          </h2>
          <p className="text-sm text-muted-foreground">
            Default: fast web search, lean composer. Pro: deep-research
            grounding, the sharper composer. Slower, sharper, 3 credits a brief.
          </p>
          <div className="mt-3 inline-flex rounded-md border border-border">
            <button
              type="button"
              onClick={() => setTier.mutate({ tier: "default" })}
              disabled={setTier.isPending || tier === "default"}
              className={`px-3 py-1.5 text-sm ${
                tier === "default"
                  ? "bg-foreground text-background"
                  : "bg-transparent text-foreground"
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
                  ? "bg-foreground text-background"
                  : "bg-transparent text-foreground"
              }`}
              aria-pressed={tier === "pro"}
            >
              🔬 Pro · 3 credits
            </button>
          </div>
          {setTier.isSuccess && (
            <span className="ml-3 text-xs text-muted-foreground">Saved.</span>
          )}
        </section>
      )}

      {/* UX audit v2 P0 #4: raw JSON editor hidden behind a disclosure.
          Business owners don't edit JSON. The form-style editor (one row
          per field) is queued as a P1 follow-up — this commit ships the
          token migration + the disclosure so the page no longer reads as
          a developer console by default. */}
      <section>
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90">▸</span>
            Show raw JSON
          </summary>
          <div className="mt-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="h-96 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground"
            />
            {error && <pre className="mt-2 whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</pre>}
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={updateRaw.isPending}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {updateRaw.isPending ? "Saving…" : "Save new version"}
              </button>
              {updateRaw.isSuccess && <span className="text-xs text-muted-foreground">Saved.</span>}
            </div>
          </div>
        </details>
      </section>

      <VersionsSection versions={versionsQuery.data ?? []} />
    </div>
  );
}

/**
 * UX audit v2 P1 #2: each version row now cross-links to the briefs that
 * came out of it. The briefs are fetched lazily once we know the spec ids,
 * grouped client-side (cap 5 per spec to keep the list scannable), and
 * rendered as compact shortId links to the public permalink.
 */
function VersionsSection({
  versions,
}: {
  versions: Pick<Row, "id" | "version" | "isCurrent" | "createdVia" | "createdAt">[];
}) {
  const specIds = useMemo(() => versions.map((v) => v.id), [versions]);
  const briefsQuery = trpc.digestSpec.listVersionBriefs.useQuery(
    { specIds },
    { enabled: specIds.length > 0, staleTime: 60_000 }
  );

  const briefsBySpec = useMemo(() => {
    const map = new Map<
      string,
      { id: string; shortId: string | null; runDate: Date | string }[]
    >();
    for (const b of briefsQuery.data ?? []) {
      const arr = map.get(b.specId) ?? [];
      if (arr.length < 5) arr.push({ id: b.id, shortId: b.shortId, runDate: b.runDate });
      map.set(b.specId, arr);
    }
    return map;
  }, [briefsQuery.data]);

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Versions</h2>
      <ul className="space-y-2 text-sm">
        {versions.map((v) => {
          const briefs = briefsBySpec.get(v.id) ?? [];
          return (
            <li key={v.id} className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <span>
                  v{v.version} {v.isCurrent && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">current</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {v.createdVia} · {new Date(v.createdAt).toLocaleString()}
                </span>
              </div>
              {briefs.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Briefs:</span>
                  {briefs.map((b) =>
                    b.shortId ? (
                      <a
                        key={b.id}
                        href={`/b/${b.shortId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground hover:bg-muted"
                        title={`Delivered ${new Date(b.runDate).toLocaleDateString()}`}
                      >
                        {b.shortId}
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
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
