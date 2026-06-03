/**
 * CAD-94 — Pro tier cost burn-rate admin dashboard.
 *
 * Read-only dashboard showing how much we're spending on Pro vs Default
 * briefs and whether the cost-overrun circuit breaker (CAD-102 /
 * `isProTierCostSane`) is hot. This is the operational counterpart to
 * the breaker: the breaker fails closed in the dispatch path, this
 * dashboard tells Faeez WHY without him having to run psql.
 *
 * Gating mirrors /admin/runs (CAD-39):
 *   1. SSR: createSupabaseServerClient().auth.getUser() — non-admin sees
 *      a 404-shaped "not found", signed-out is bounced to sign-in.
 *   2. The page itself runs raw SQL via the server-side `db` client and
 *      hands plain data to a "use client" renderer. No tRPC procedures —
 *      this is admin-only and the query shape is bespoke enough that a
 *      tRPC router entry would just be an extra hop.
 *
 * Three panels:
 *   1. Circuit-breaker banner — pulls from `isProTierCostSane()` so the
 *      threshold we render is identical to the one the dispatch path
 *      checks. No drift possible.
 *   2. 7-day rolling table — one row per UTC day, Default vs Pro cost
 *      side-by-side. SUM(cost_events.cost_usd) joined to digest_runs and
 *      grouped on metadata->'tier'->>'resolved'. NULL/missing tier
 *      attribution collapses into "default" (matches CAD-89's default).
 *   3. Top-10 most-expensive runs (last 7 days) — quick "where did the
 *      money go?" view with a link back to /admin/runs/[id].
 *
 * Why raw SQL via db.execute over the drizzle query builder: jsonb
 * extracts (metadata #>> '{tier,resolved}') are awkward in the
 * type-mapper, and the GROUP BY on date_trunc('day', ...) plus the
 * pivot-style "default vs pro" aggregation reads cleaner as one CTE.
 * No new schema, no new migrations — this is purely a read pattern.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { AppNav } from "@/components/nav/app-nav";
import { isProTierCostSane } from "@/server/billing/circuit-breaker";
import { CostClient } from "./cost-client";

export const dynamic = "force-dynamic";

interface DailyRow {
  day: string;          // YYYY-MM-DD (UTC)
  defaultUsd: number;
  proUsd: number;
}

interface TopRunRow {
  runId: string;
  createdAt: string;
  tier: "default" | "pro" | "unknown";
  totalUsd: number;
  status: string;
  userEmail: string | null;
}

export default async function AdminCostPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");
  if (!isAdminEmail(user.email)) {
    // Don't leak the route's existence to non-admin users.
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Breaker status (matches the value the dispatch path sees).
  // ------------------------------------------------------------------
  // isProTierCostSane swallows DB errors via the same db client. If the
  // DB is unreachable here the redirect/auth check above already would
  // have failed, so we don't need an extra try/catch.
  const breaker = await isProTierCostSane();

  // ------------------------------------------------------------------
  // 7-day rolling cost: one row per UTC day, default vs pro side-by-side.
  // ------------------------------------------------------------------
  // Coalesce missing/legacy tier metadata to 'default' — matches CAD-89
  // (per-spec default is 'default'). Pro is opt-in, so an unset tier on
  // a digest_run is by definition NOT Pro.
  const dailyRaw = await db.execute<{
    day: string;
    tier_resolved: string;
    sum_usd: string;
  }>(sql`
    SELECT
      to_char(date_trunc('day', ce.created_at), 'YYYY-MM-DD') AS day,
      COALESCE(dr.metadata #>> '{tier,resolved}', 'default') AS tier_resolved,
      COALESCE(SUM(ce.cost_usd), 0)::text AS sum_usd
    FROM cost_events ce
    LEFT JOIN digest_runs dr ON dr.id = ce.digest_run_id
    WHERE ce.created_at >= (now() AT TIME ZONE 'UTC')::date - INTERVAL '6 days'
    GROUP BY day, tier_resolved
    ORDER BY day DESC
  `);

  // Pivot into one row per day.
  const dailyMap = new Map<string, DailyRow>();
  for (const r of dailyRaw) {
    const existing = dailyMap.get(r.day) ?? {
      day: r.day,
      defaultUsd: 0,
      proUsd: 0,
    };
    const usd = Number(r.sum_usd);
    // Anything not literally 'pro' (incl. legacy NULLs coalesced above)
    // counts as default — Pro is opt-in, so attribution is fail-default.
    if (r.tier_resolved === "pro") {
      existing.proUsd += usd;
    } else {
      existing.defaultUsd += usd;
    }
    dailyMap.set(r.day, existing);
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) =>
    b.day.localeCompare(a.day)
  );

  // ------------------------------------------------------------------
  // Top-10 most-expensive runs in the last 7 days.
  // ------------------------------------------------------------------
  // We sum cost_events per digest_run, then pick the 10 priciest. The
  // tier label comes off the run's own metadata so an admin can see at
  // a glance whether a runaway is Pro-side or Default-side.
  const topRunsRaw = await db.execute<{
    run_id: string;
    created_at: string;
    tier_resolved: string | null;
    total_usd: string;
    status: string;
    user_email: string | null;
  }>(sql`
    SELECT
      dr.id AS run_id,
      to_char(dr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      dr.metadata #>> '{tier,resolved}' AS tier_resolved,
      COALESCE(SUM(ce.cost_usd), 0)::text AS total_usd,
      dr.status,
      u.email AS user_email
    FROM digest_runs dr
    JOIN cost_events ce ON ce.digest_run_id = dr.id
    LEFT JOIN users u ON u.id = dr.user_id
    WHERE ce.created_at >= (now() AT TIME ZONE 'UTC')::date - INTERVAL '6 days'
    GROUP BY dr.id, dr.created_at, dr.metadata, dr.status, u.email
    ORDER BY SUM(ce.cost_usd) DESC NULLS LAST
    LIMIT 10
  `);

  const topRuns: TopRunRow[] = topRunsRaw.map((r) => ({
    runId: r.run_id,
    createdAt: r.created_at,
    tier:
      r.tier_resolved === "pro"
        ? "pro"
        : r.tier_resolved === "default"
          ? "default"
          : "unknown",
    totalUsd: Number(r.total_usd),
    status: r.status,
    userEmail: r.user_email,
  }));

  // Convenience: today's split (top of dashboard).
  const todayKey = new Date().toISOString().slice(0, 10);
  const today =
    daily.find((d) => d.day === todayKey) ?? {
      day: todayKey,
      defaultUsd: 0,
      proUsd: 0,
    };

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="admin" />
      <CostClient
        adminEmail={user.email ?? ""}
        breaker={{
          ok: breaker.ok,
          usdToday: breaker.usdToday,
          capUsd: breaker.capUsd,
          reason: breaker.reason ?? null,
        }}
        today={today}
        daily={daily}
        topRuns={topRuns}
      />
    </div>
  );
}

// Re-export the row types so the client component can share them.
export type { DailyRow, TopRunRow };
