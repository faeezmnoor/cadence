/**
 * Ticket 2 — /admin/missing-capabilities
 *
 * Read-only operational dashboard. Answers ONE question:
 *   "Which topic keywords are we delivering badly today, ranked by
 *    descending volume — i.e. where should we spend our next hour adding
 *    a data source, prompt rule, or template?"
 *
 * Data path:
 *   - Source: digest_runs.metadata.lowConfidence (set in
 *     apps/web/server/digest/run.ts when a delivered brief falls below
 *     any of: source-resolve ≥ 0.8, ≥2 resolved sources, ≥2 sections).
 *   - Bucketing: digest_runs.metadata.specSubmittedTopic.templateId
 *     classified by classifyTopic() at run time (Ticket 3). Off-template
 *     specs fall into the "(off-template)" bucket — those are the
 *     highest-value rows: real user demand we don't have a starter
 *     template for yet.
 *   - Window: last 30 days (calendar UTC).
 *
 * Gating mirrors /admin/runs and /admin/cost (CAD-39, CAD-94):
 *   1. SSR auth via createSupabaseServerClient().
 *   2. isAdminEmail() — non-admin sees a 404-shaped "not found"; no leak
 *      of the route's existence.
 *
 * No new migrations, no new schema, no new tRPC procedures. Pure read on
 * the existing jsonb metadata column.
 *
 * Why server component + raw SQL: same rationale as /admin/cost — jsonb
 * extracts plus a GROUP BY on a derived bucket read cleanly as a single
 * CTE, and we don't need interactivity. The whole page renders SSR with
 * no client-side hydration cost.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { AppNav } from "@/components/nav/app-nav";
import { DIGEST_TEMPLATES } from "@/lib/digest-spec/templates";

export const dynamic = "force-dynamic";

interface BucketRow {
  bucketId: string;
  bucketLabel: string;
  lowConfidenceCount: number;
  firstSeen: string;
  lastSeen: string;
  sampleSpecs: string[];
}

function labelForBucket(id: string): string {
  if (id === "__off_template__") return "(off-template)";
  const tpl = DIGEST_TEMPLATES.find((t) => t.id === id);
  return tpl ? `${tpl.emoji} ${tpl.label}` : id;
}

async function fetchBuckets(): Promise<BucketRow[]> {
  // We bucket by metadata.specSubmittedTopic.templateId (string) and
  // collapse NULL/missing into '__off_template__'. Sample specs = up to
  // 3 distinct rawTopics arrays serialized to JSON, joined into a string
  // (newest first). Counting uses COUNT(*) over the 30-day window.
  //
  // metadata.lowConfidence presence is the filter; the column is jsonb
  // notnull default '{}'::jsonb so `?` (key-existence) is the cheap
  // predicate.
  const result = await db.execute(sql`
    WITH flagged AS (
      SELECT
        COALESCE(
          NULLIF(metadata #>> '{specSubmittedTopic,templateId}', ''),
          '__off_template__'
        ) AS bucket_id,
        metadata #>> '{specSubmittedTopic,rawTopics}' AS raw_topics_json,
        metadata #>> '{lowConfidence,reason}' AS reason,
        created_at
      FROM digest_runs
      WHERE metadata ? 'lowConfidence'
        AND created_at >= now() - interval '30 days'
    )
    SELECT
      bucket_id,
      COUNT(*)::int AS low_confidence_count,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen,
      (
        ARRAY_AGG(DISTINCT raw_topics_json) FILTER (WHERE raw_topics_json IS NOT NULL)
      )[1:3] AS sample_specs
    FROM flagged
    GROUP BY bucket_id
    ORDER BY low_confidence_count DESC, last_seen DESC
    LIMIT 100
  `);
  const rows = (result as unknown as {
    rows: Array<{
      bucket_id: string;
      low_confidence_count: number;
      first_seen: Date | string;
      last_seen: Date | string;
      sample_specs: string[] | null;
    }>;
  }).rows;

  return rows.map((r) => ({
    bucketId: r.bucket_id,
    bucketLabel: labelForBucket(r.bucket_id),
    lowConfidenceCount: Number(r.low_confidence_count),
    firstSeen:
      r.first_seen instanceof Date
        ? r.first_seen.toISOString()
        : new Date(r.first_seen).toISOString(),
    lastSeen:
      r.last_seen instanceof Date
        ? r.last_seen.toISOString()
        : new Date(r.last_seen).toISOString(),
    sampleSpecs: (r.sample_specs ?? []).filter(
      (s): s is string => typeof s === "string"
    ),
  }));
}

function formatDay(iso: string): string {
  return iso.slice(0, 10);
}

export default async function MissingCapabilitiesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");
  if (!isAdminEmail(user.email)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          The page you&apos;re looking for doesn&apos;t exist or you don&apos;t
          have access.
        </p>
      </div>
    );
  }

  const buckets = await fetchBuckets();
  const total = buckets.reduce((acc, b) => acc + b.lowConfidenceCount, 0);
  const offTemplate = buckets.find((b) => b.bucketId === "__off_template__");
  const offTemplateCount = offTemplate?.lowConfidenceCount ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="admin" isAdmin />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Missing capabilities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Topic keywords we delivered briefs on, but flagged as low-confidence
            (thin source resolution, few sources, or single-section output).
            Sorted by descending count — top rows = highest demand for new data
            sources.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Window: last 30 days · Total flagged runs:{" "}
            <span className="font-mono font-medium text-foreground">{total}</span> ·
            Off-template share:{" "}
            <span className="font-mono font-medium text-foreground">
              {total > 0 ? Math.round((offTemplateCount / total) * 100) : 0}%
            </span>
          </p>
        </header>

        {buckets.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
            No low-confidence runs in the last 30 days. Either coverage is
            healthy or telemetry has not collected enough samples yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Topic bucket</th>
                  <th className="px-4 py-2 font-medium">Low-conf runs</th>
                  <th className="px-4 py-2 font-medium">First seen</th>
                  <th className="px-4 py-2 font-medium">Last seen</th>
                  <th className="px-4 py-2 font-medium">Sample specs</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => {
                  const isOff = b.bucketId === "__off_template__";
                  return (
                    <tr
                      key={b.bucketId}
                      className="border-t border-border align-top"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{b.bucketLabel}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {b.bucketId}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">
                        {b.lowConfidenceCount}
                        {isOff && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600"
                            title="No starter template matches these specs — strong signal to add one"
                          >
                            add template?
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatDay(b.firstSeen)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatDay(b.lastSeen)}
                      </td>
                      <td className="px-4 py-3">
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {b.sampleSpecs.length === 0 ? (
                            <li className="italic">no spec topics captured</li>
                          ) : (
                            b.sampleSpecs.map((s, i) => (
                              <li
                                key={i}
                                className="line-clamp-2 break-all font-mono"
                              >
                                {s}
                              </li>
                            ))
                          )}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <p>
            Edit starter templates at{" "}
            <code className="font-mono">apps/web/lib/digest-spec/templates.ts</code>.
          </p>
          <Link
            href="/admin/runs"
            className="underline-offset-2 hover:underline"
          >
            ← Back to runs
          </Link>
        </footer>
      </main>
    </div>
  );
}
