"use client";

/**
 * /briefs/[id] client — Overview + Advanced tabs.
 *
 * Wave 6 / Bug 13 port: legacy /spec page surfaced version history and the
 * raw-JSON editor user-globally. Multi-brief makes that wrong — the editor
 * needs to act on ONE brief. This component is the per-brief surface.
 *
 * Tab state is local (useState) — no URL hash, since the Advanced tab is
 * a power-user surface and we don't want bookmarkable links into JSON
 * editor mode. Default tab is always Overview.
 *
 * The version-history list reuses the cross-link pattern from the legacy
 * /spec page: for each spec id we fetch up to a handful of delivered
 * briefs and render them as shortId chips that open the public permalink.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { digestSpecSchema, type DigestSpecV1 } from "@/lib/digest-spec/schema";
import {
  formatBriefStatus,
  formatCreatedVia,
  formatFrequency,
  formatLanguage,
  formatLength,
  formatTier,
  formatTone,
} from "@/lib/labels";
import { TierExplainer } from "@/components/billing/tier-explainer";
import {
  STACK_COSTS,
  STACK_DESCRIPTIONS,
  STACK_ORDER,
  STACK_SUMMARIES,
  isAdvancedStack,
  monthlyCreditEstimate,
  nextDeliveryCost,
  normalizeStack,
  stackLabel,
  type ResearchStack,
} from "@/lib/research-stack";

export type BriefRow = {
  id: string;
  name: string;
  status: string;
  tier: string;
  version: number;
  scheduling: unknown;
  spec: unknown;
  nextRunAt: string | null;
  pausedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VersionRow = {
  id: string;
  version: number;
  isCurrent: boolean | null;
  status: string;
  createdVia: string;
  createdAt: string;
};

type Tab = "overview" | "advanced";

export function BriefDetailClient({
  brief: initialBrief,
  initialVersions,
  initialVersionsTotal,
  initialVersionsPageSize,
  proTierAlphaEnabled = false,
}: {
  brief: BriefRow;
  initialVersions: VersionRow[];
  initialVersionsTotal: number;
  initialVersionsPageSize: number;
  proTierAlphaEnabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const utils = trpc.useUtils();

  const briefQuery = trpc.briefs.getById.useQuery(
    { id: initialBrief.id },
    {
      // Hydrate from server payload. tRPC's serializer rehydrates Date
      // objects on the client, so the typed query shape may diverge from
      // our ISO-string Row — readers below coerce defensively.
      placeholderData: initialBrief as never,
    }
  );

  const brief = useMemo(() => {
    const data = briefQuery.data as unknown;
    if (!data || typeof data !== "object") return initialBrief;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id ?? initialBrief.id),
      name: String(row.name ?? initialBrief.name),
      status: String(row.status ?? initialBrief.status),
      tier: String(row.tier ?? initialBrief.tier),
      version: Number(row.version ?? initialBrief.version),
      scheduling: row.scheduling ?? initialBrief.scheduling,
      spec: row.spec ?? initialBrief.spec,
      nextRunAt: toIso(row.nextRunAt) ?? initialBrief.nextRunAt,
      pausedAt: toIso(row.pausedAt) ?? initialBrief.pausedAt,
      archivedAt: toIso(row.archivedAt) ?? initialBrief.archivedAt,
      createdAt: toIso(row.createdAt) ?? initialBrief.createdAt,
      updatedAt: toIso(row.updatedAt) ?? initialBrief.updatedAt,
    } satisfies BriefRow;
  }, [briefQuery.data, initialBrief]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <Link
          href={"/briefs" as never}
          className="inline-flex items-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← All briefs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {brief.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {/* CAD-215: while advanced research is paused, every delivery is
              served (and debited) at standard depth regardless of the
              persisted tier — show the depth the user will actually get. */}
          {formatBriefStatus(brief.status)} ·{" "}
          {formatTier(proTierAlphaEnabled ? brief.tier : "default")} · v
          {brief.version}
        </p>
      </header>

      <nav
        role="tablist"
        aria-label="Brief detail tabs"
        className="inline-flex rounded-md border border-border bg-card p-1 text-sm"
      >
        <TabButton
          label="Overview"
          active={tab === "overview"}
          onClick={() => setTab("overview")}
        />
        <TabButton
          label="Advanced"
          active={tab === "advanced"}
          onClick={() => setTab("advanced")}
        />
      </nav>

      {tab === "overview" ? (
        <OverviewTab brief={brief} />
      ) : (
        <AdvancedTab
          brief={brief}
          initialVersions={initialVersions}
          initialVersionsTotal={initialVersionsTotal}
          initialVersionsPageSize={initialVersionsPageSize}
          proTierAlphaEnabled={proTierAlphaEnabled}
          onSaved={() => utils.briefs.getById.invalidate({ id: brief.id })}
        />
      )}
    </main>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "rounded px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

function OverviewTab({ brief }: { brief: BriefRow }) {
  const summary = useMemo(() => extractSummary(brief.spec), [brief.spec]);
  const scheduleLabel = useMemo(
    () => humanizeSchedule(brief.scheduling),
    [brief.scheduling]
  );
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Schedule
        </h2>
        <p className="text-sm text-foreground">{scheduleLabel}</p>
        {brief.nextRunAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Next delivery: {new Date(brief.nextRunAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Spec summary
        </h2>
        {summary.length > 0 ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {summary.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing here yet — tweak this brief from chat to fill it in.
          </p>
        )}
      </section>
    </div>
  );
}

function AdvancedTab({
  brief,
  initialVersions,
  initialVersionsTotal,
  initialVersionsPageSize,
  proTierAlphaEnabled,
  onSaved,
}: {
  brief: BriefRow;
  initialVersions: VersionRow[];
  initialVersionsTotal: number;
  initialVersionsPageSize: number;
  proTierAlphaEnabled: boolean;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const updateRaw = trpc.briefs.updateRaw.useMutation({
    onSuccess: async () => {
      onSaved();
      await utils.briefs.listVersions.invalidate({ id: brief.id });
    },
  });
  const setTier = trpc.briefs.setTier.useMutation({
    onSuccess: async () => {
      onSaved();
    },
  });
  const tier = normalizeStack(brief.tier);

  const [draft, setDraft] = useState<string>(() =>
    JSON.stringify(brief.spec ?? {}, null, 2)
  );
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
      setError(
        result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("\n")
      );
      return;
    }
    updateRaw.mutate({
      id: brief.id,
      spec: result.data,
    });
  }

  const isArchived = brief.status === "archived";

  return (
    <div className="space-y-6">
      {/* CAD-203 — Configurable Stack Settings: research-depth toggle +
          live credit cost preview + transparency table. Reuses the
          briefs.setTier mutation (no schema change). The internal
          tier="default"|"pro" enum stays; user-facing wording is
          "Standard research" / "Advanced research" per CAD-202 and
          project_cadence_no_tier_plans. NO plan-tier nouns. NO "upgrade".
          Credit cost is the primary axis. */}
      {proTierAlphaEnabled && brief ? (
        <ConfigurableStackSettings
          brief={brief}
          tier={tier}
          setTier={setTier}
        />
      ) : (
        // CAD-215: advanced research is product-paused. No depth switch, no
        // comparison — one quiet line. The full card above returns when the
        // tier un-pauses (flag back on).
        <ResearchDepthPausedCard />
      )}

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Raw spec (JSON)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Power-user surface. Edits here bump this brief&apos;s version and
          re-derive schedule + next delivery from the new spec. Most users
          tweak via chat instead.
        </p>
        <textarea
          aria-label="Raw spec JSON"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          disabled={isArchived}
          className="h-96 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground disabled:opacity-60"
        />
        {error && (
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {error}
          </pre>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={updateRaw.isPending || isArchived}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {updateRaw.isPending ? "Saving…" : "Save new version"}
          </button>
          {updateRaw.isSuccess && (
            <span className="text-xs text-muted-foreground">Saved.</span>
          )}
          {isArchived && (
            <span className="text-xs text-muted-foreground">
              Archived briefs are read-only.
            </span>
          )}
        </div>
      </section>

      <VersionsSection
        briefId={brief.id}
        initialItems={initialVersions}
        initialTotal={initialVersionsTotal}
        initialPageSize={initialVersionsPageSize}
      />
    </div>
  );
}

function VersionsSection({
  briefId,
  initialItems,
  initialTotal,
  initialPageSize,
}: {
  briefId: string;
  initialItems: VersionRow[];
  initialTotal: number;
  initialPageSize: number;
}) {
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const versionsQuery = trpc.briefs.listVersions.useQuery(
    { id: briefId, limit: pageSize, offset: 0 },
    {
      initialData:
        pageSize === initialPageSize
          ? ({ items: initialItems, total: initialTotal } as never)
          : undefined,
    }
  );

  const data = versionsQuery.data;
  const items: VersionRow[] = useMemo(() => {
    const raw = (data?.items ?? []) as unknown[];
    return raw.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        version: Number(row.version ?? 0),
        isCurrent: (row.isCurrent as boolean | null) ?? null,
        status: String(row.status ?? ""),
        createdVia: String(row.createdVia ?? ""),
        createdAt: toIso(row.createdAt) ?? "",
      };
    });
  }, [data]);
  const total = data?.total ?? initialTotal;

  const specIds = useMemo(() => items.map((v) => v.id), [items]);
  const briefsQuery = trpc.briefs.listVersionBriefs.useQuery(
    { specIds },
    { enabled: specIds.length > 0, staleTime: 60_000 }
  );

  const briefsBySpec = useMemo(() => {
    const map = new Map<
      string,
      { id: string; shortId: string | null; runDate: Date | string }[]
    >();
    for (const b of (briefsQuery.data ?? []) as Array<{
      id: string;
      specId: string;
      shortId: string | null;
      runDate: Date | string;
    }>) {
      const arr = map.get(b.specId) ?? [];
      if (arr.length < 5) arr.push({ id: b.id, shortId: b.shortId, runDate: b.runDate });
      map.set(b.specId, arr);
    }
    return map;
  }, [briefsQuery.data]);

  const canShowMore = items.length < total;

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Version history
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No versions yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((v) => {
            const versionBriefs = briefsBySpec.get(v.id) ?? [];
            return (
              <li
                key={v.id}
                className="rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    v{v.version}
                    {v.isCurrent && (
                      <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        current
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatCreatedVia(v.createdVia)} ·{" "}
                    {v.createdAt
                      ? new Date(v.createdAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
                {versionBriefs.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Briefs:</span>
                    {versionBriefs.map((b) =>
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
      )}
      {canShowMore && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setPageSize((s) => s + 10)}
            disabled={versionsQuery.isFetching}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            {versionsQuery.isFetching
              ? "Loading…"
              : `Show more (${total - items.length} remaining)`}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * CAD-203 — Configurable Stack Settings card.
 *
 * Renders inside the Advanced tab. Surfaces:
 *   1. Current-stack badge ("Standard research · 1 credit/brief")
 *   2. Toggle between standard / advanced research (writes digest_specs.tier)
 *   3. Live preview: next delivery credit cost + monthly run-rate estimate
 *      based on the brief's scheduling rule (briefsPerDay × 30 × cost)
 *   4. Transparency table — search provider, composer model, depth,
 *      citation density, latency — sourced from lib/research-stack.ts
 *
 * Saved-state is the existing setTier mutation (idempotent, no version bump).
 */
function ConfigurableStackSettings({
  brief,
  tier,
  setTier,
}: {
  brief: BriefRow;
  tier: ResearchStack;
  setTier: ReturnType<typeof trpc.briefs.setTier.useMutation>;
}) {
  const [draftStack, setDraftStack] = useState<ResearchStack>(tier);

  // Keep local draft in sync if the server-truth tier flips (mutation success,
  // another tab, refetch). We intentionally clobber pending draft only when
  // the server-truth changes — not on every render.
  useEffect(() => {
    setDraftStack(tier);
  }, [tier]);

  const nextCost = nextDeliveryCost(draftStack);
  const monthlyEstDraft = monthlyCreditEstimate(brief.scheduling, draftStack);
  const dirty = draftStack !== tier;

  const currentLabel = stackLabel(tier);
  const currentCost = STACK_COSTS[tier];

  return (
    <section
      aria-label="Research depth"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Research depth
          </h2>
          <p
            className="mt-1 text-sm font-semibold text-foreground"
            data-testid="current-stack-badge"
          >
            {isAdvancedStack(tier) ? "🔬 " : ""}
            {currentLabel} · {currentCost} credit{currentCost === 1 ? "" : "s"}{" "}
            per brief
          </p>
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Switch research depth per brief. Credits are the only billing — you
        spend more credits when you point this brief at deeper research, and
        nothing else changes about how you&apos;re billed.
      </p>

      {/* Option picker — data-driven from the stack registry so adding a
          stack is a lib/research-stack.ts change, not UI surgery
          (founder ruling 2026-06-11: flexibility over fixed tiers). */}
      <div
        className="mt-4 grid gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Choose research depth"
      >
        {STACK_ORDER.map((stack) => {
          const cost = STACK_COSTS[stack];
          const selected = draftStack === stack;
          return (
            <button
              key={stack}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDraftStack(stack)}
              disabled={setTier.isPending}
              data-testid={`stack-option-${stack}`}
              className={`rounded-md border p-3 text-left transition ${
                selected
                  ? "border-foreground bg-foreground/5 ring-1 ring-foreground"
                  : "border-border bg-transparent hover:bg-muted"
              }`}
            >
              <span className="block text-sm font-medium text-foreground">
                {stack === "default" ? "" : "🔬 "}
                {stackLabel(stack)}
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-foreground">
                {cost} credit{cost === 1 ? "" : "s"} per brief
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {STACK_SUMMARIES[stack]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live cost preview */}
      <div
        className="mt-4 rounded-md border border-border bg-background p-3 text-sm"
        data-testid="stack-cost-preview"
      >
        <p className="text-foreground">
          Next delivery will cost{" "}
          <span className="font-semibold">
            {nextCost} credit{nextCost === 1 ? "" : "s"}
          </span>{" "}
          at {stackLabel(draftStack).toLowerCase()}.
        </p>
        {monthlyEstDraft > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Run-rate at this depth: ~{monthlyEstDraft} credit
            {monthlyEstDraft === 1 ? "" : "s"} per month for this brief (
            {STACK_ORDER.map(
              (s, i) =>
                `${i > 0 ? " · " : ""}~${monthlyCreditEstimate(brief.scheduling, s)} at ${STACK_COSTS[s]} credit${STACK_COSTS[s] === 1 ? "" : "s"}/brief`
            ).join("")}
            ).
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Run-rate preview unavailable — set this brief&apos;s schedule
            first.
          </p>
        )}
      </div>

      {/* Save / status */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTier.mutate({ id: brief.id, tier: draftStack })}
          disabled={!dirty || setTier.isPending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition disabled:opacity-50"
          data-testid="save-stack-button"
        >
          {setTier.isPending
            ? "Saving…"
            : dirty
              ? "Switch research depth"
              : "Saved"}
        </button>
        {setTier.isSuccess && !dirty && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
        {setTier.isError && (
          <span className="text-xs text-destructive">
            Couldn&apos;t save — try again.
          </span>
        )}
      </div>

      {/* Transparency table — what you actually get */}
      <details className="mt-4 rounded-md border border-border bg-background p-3 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
          What changes between standard and advanced
        </summary>
        <div className="mt-3">
          {/* This card only renders when the alpha flag is on (CAD-215), so
              the explainer can assert availability rather than re-deriving
              it — client components can't read the env flag themselves. */}
          <TierExplainer variant="compact" proTierAlphaEnabled />
        </div>
        <table
          className="mt-3 w-full text-left text-xs"
          data-testid="stack-transparency-table"
        >
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 pr-2 font-medium"></th>
              <th className="pb-2 pr-2 font-medium">Standard</th>
              <th className="pb-2 pr-2 font-medium">🔬 Advanced · deeper digging</th>
              <th className="pb-2 font-medium">🔬 Advanced · live web search</th>
            </tr>
          </thead>
          <tbody>
            {STACK_DESCRIPTIONS.map((row) => (
              <tr
                key={row.label}
                className="align-top border-t border-border/60"
              >
                <th
                  scope="row"
                  className="py-2 pr-2 font-medium text-foreground"
                >
                  {row.label}
                </th>
                <td className="py-2 pr-2 text-muted-foreground">
                  {row.default}
                </td>
                <td className="py-2 pr-2 text-muted-foreground">{row.pro}</td>
                <td className="py-2 text-muted-foreground">
                  {row.pro_websearch}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Advanced briefs include a 🔬 footer marker on delivery so you always
          know which research depth produced the brief.
        </p>
      </details>
    </section>
  );
}

/**
 * CAD-215 — quiet replacement for ConfigurableStackSettings while advanced
 * research is product-paused (PRO_TIER_ALPHA off). The ruling: users must
 * not be able to opt into advanced research or see upsell surfaces while
 * the depth is paused, regardless of what tier their spec has persisted.
 * Keeps the "Research depth" section so the page shape doesn't jump when
 * the flag flips back on.
 */
function ResearchDepthPausedCard() {
  return (
    <section
      aria-label="Research depth"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground"
    >
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Research depth
      </h2>
      <p className="mt-1 text-sm font-semibold text-foreground">
        Standard research · 1 credit per brief
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Advanced research is temporarily unavailable while we improve it.
      </p>
    </section>
  );
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

function extractSummary(spec: unknown): [string, string][] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as Partial<DigestSpecV1>;
  const rows: [string, string][] = [];
  if (s.topics?.length) rows.push(["Topics", s.topics.join(", ")]);
  if (s.entities?.companies?.length)
    rows.push(["Companies", s.entities.companies.join(", ")]);
  if (s.entities?.tickers?.length)
    rows.push(["Tickers", s.entities.tickers.join(", ")]);
  if (s.entities?.commodities?.length)
    rows.push(["Commodities", s.entities.commodities.join(", ")]);
  if (s.keywords_include?.length)
    rows.push(["Include", s.keywords_include.join(", ")]);
  if (s.keywords_exclude?.length)
    rows.push(["Exclude", s.keywords_exclude.join(", ")]);
  if (s.cadence?.frequency)
    rows.push(["Frequency", formatFrequency(s.cadence.frequency)]);
  if (s.cadence?.delivery_time_local)
    rows.push(["Delivery time", s.cadence.delivery_time_local]);
  if (s.cadence?.days_of_week?.length)
    rows.push(["Days", s.cadence.days_of_week.join(", ")]);
  if (s.tone_preset) rows.push(["Tone", formatTone(s.tone_preset)]);
  if (s.length_target) rows.push(["Length", formatLength(s.length_target)]);
  if (s.language) rows.push(["Language", formatLanguage(s.language)]);
  return rows;
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function humanizeSchedule(rule: unknown): string {
  if (!rule || typeof rule !== "object") return "Schedule not set";
  const r = rule as {
    cadence?: {
      kind?: string;
      weekdays?: number[];
      monthlyDay?: number | "last";
      cronExpr?: string;
    };
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
