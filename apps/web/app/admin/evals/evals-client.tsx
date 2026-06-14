import Link from "next/link";
import type {
  EvalGateResult,
  RecentRating,
} from "@/server/evals/pro-eval-gate";

/**
 * CAD-90: presentation for /admin/evals.
 *
 * No client interactivity needed (yet) — the gate is fully derived from DB
 * state. We keep it as a plain RSC-child component so it renders without
 * shipping JS to the admin.
 */
export function EvalsClient({
  gate,
  recent,
  config,
}: {
  gate: EvalGateResult;
  recent: RecentRating[];
  config: {
    minSamplesPerTier: number;
    minLead: number;
    minAdvancedSpecificity: number;
    windowDays: number;
  };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Admin · Pro Tier Eval Gate</h1>
        <p className="text-sm text-muted-foreground">
          Window: last {config.windowDays} days · Gate:{" "}
          {config.minSamplesPerTier}+ ratings per tier, advanced lead &ge;{" "}
          {config.minLead.toFixed(2)} composite points AND advanced specificity
          &ge; {config.minAdvancedSpecificity.toFixed(1)}. Grounding is floored
          on niche topics (CAD-225) — not gated.
        </p>
      </header>

      <GateBanner gate={gate} config={config} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TierCard
          title="Pro"
          count={gate.metrics.proCount}
          composite={gate.metrics.proCompositeAvg}
          axes={gate.metrics.proAxes}
          minSamples={config.minSamplesPerTier}
        />
        <TierCard
          title="Default"
          count={gate.metrics.defaultCount}
          composite={gate.metrics.defaultCompositeAvg}
          axes={gate.metrics.defaultAxes}
          minSamples={config.minSamplesPerTier}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Last 10 manually-rated briefs</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No briefs have been manually rated yet. Rate some from
            /admin/runs/[id] to populate the gate.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {recent.map((r) => (
              <li
                key={r.runId}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <TierBadge tier={r.tier} />
                  <div className="font-mono text-xs text-muted-foreground">
                    {r.runId.slice(0, 8)}…
                  </div>
                  <div className="text-sm">
                    composite{" "}
                    <span className="font-medium">
                      {r.composite.toFixed(2)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      G {r.grounding} · S {r.specificity} · F {r.fit}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{new Date(r.ratedAt).toLocaleString()}</span>
                  <span>by {r.ratedBy}</span>
                  <Link
                    href={{ pathname: "/admin/runs/[id]", query: { id: r.runId } }}
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    view
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function GateBanner({
  gate,
  config,
}: {
  gate: EvalGateResult;
  config: {
    minSamplesPerTier: number;
    minLead: number;
    minAdvancedSpecificity: number;
  };
}) {
  // CAD-225: specificity is the axis advanced genuinely wins on, so it
  // headlines the verdict alongside the composite lead.
  const advancedSpecificity = gate.metrics.proAxes?.specificity ?? null;
  if (gate.ready) {
    return (
      <div
        role="status"
        className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
      >
        <div className="font-semibold">Ready to flip advanced research to GA</div>
        <div className="mt-1">
          Advanced research is leading standard by{" "}
          <span className="font-medium">
            {gate.metrics.lead?.toFixed(2)}
          </span>{" "}
          composite points and rating{" "}
          <span className="font-medium">
            {advancedSpecificity?.toFixed(2)}
          </span>{" "}
          on specificity with{" "}
          {gate.metrics.proCount} advanced / {gate.metrics.defaultCount} standard
          ratings.
        </div>
      </div>
    );
  }
  const reasonText = reasonLabel(gate.reason, config);
  return (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="font-semibold">Not ready: {reasonText}</div>
      <div className="mt-1">
        Advanced {gate.metrics.proCount} / Standard {gate.metrics.defaultCount}{" "}
        ratings ·{" "}
        {gate.metrics.lead === null
          ? "lead n/a"
          : `lead ${gate.metrics.lead.toFixed(2)}`}{" "}
        ·{" "}
        {advancedSpecificity === null
          ? "specificity n/a"
          : `specificity ${advancedSpecificity.toFixed(2)}`}
      </div>
    </div>
  );
}

function reasonLabel(
  reason: EvalGateResult["reason"],
  config: { minSamplesPerTier: number; minLead: number; minAdvancedSpecificity: number }
): string {
  switch (reason) {
    case "no_data":
      return "no manually-rated briefs yet";
    case "insufficient_pro":
      return `need >= ${config.minSamplesPerTier} advanced ratings`;
    case "insufficient_default":
      return `need >= ${config.minSamplesPerTier} standard ratings`;
    case "lead_below_threshold":
      return `advanced must lead standard by >= ${config.minLead.toFixed(2)} composite`;
    case "specificity_below_threshold":
      return `advanced specificity must be >= ${config.minAdvancedSpecificity.toFixed(1)}`;
    case "ready":
      return "ready";
  }
}

function TierCard({
  title,
  count,
  composite,
  axes,
  minSamples,
}: {
  title: string;
  count: number;
  composite: number | null;
  axes: { grounding: number; specificity: number; fit: number } | null;
  minSamples: number;
}) {
  const enough = count >= minSamples;
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            enough
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {count} / {minSamples}
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold">
        {composite === null ? "—" : composite.toFixed(2)}
      </div>
      <div className="text-xs text-muted-foreground">composite avg</div>
      {axes ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <Axis label="Grounding" value={axes.grounding} />
          <Axis label="Specificity" value={axes.specificity} />
          <Axis label="Fit" value={axes.fit} />
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          no samples in window
        </div>
      )}
    </div>
  );
}

function Axis({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-background px-2 py-1">
      <div className="font-medium">{value.toFixed(2)}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const isPro = tier === "pro";
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        isPro
          ? "bg-purple-100 text-purple-800"
          : "bg-neutral-100 text-neutral-700"
      }`}
    >
      {tier}
    </span>
  );
}
