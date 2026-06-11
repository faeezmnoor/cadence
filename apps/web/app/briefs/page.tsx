/**
 * /briefs — multi-brief management surface (Phase A UI, ticket 1).
 *
 * Per multi-brief UX v1 §6, this is the post-link home: a list of all
 * non-archived briefs for the signed-in user, sorted by next delivery
 * (active first, then paused). The page itself is a thin server shell
 * that:
 *   1. Gates on auth (Supabase),
 *   2. Hydrates the initial briefs.list payload server-side so the first
 *      paint isn't a spinner,
 *   3. Hands the rest of the rendering + mutation handling to the client
 *      component.
 *
 * Why server-fetch the initial list rather than client-only useQuery:
 * the briefs router takes a userId-scoped DB read, and we already have
 * the user in scope from Supabase. Hydrating sidesteps a request hop on
 * the critical path and matches the pattern already used by /spec.
 */
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs } from "@/server/db/schema";
import { AppNav } from "@/components/nav/app-nav";
import { BriefsClient, type BriefRow } from "./briefs-client";
import { maxBriefsForEmail } from "@/server/briefs/limit";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // Mirror briefs.list (kept inline rather than calling the tRPC server
  // helper because we want a typed Drizzle round-trip without the runtime
  // overhead of a tRPC procedure call in a server component).
  const specs = await db
    .select({
      id: digestSpecs.id,
      name: digestSpecs.name,
      status: digestSpecs.status,
      scheduling: digestSpecs.scheduling,
      tier: digestSpecs.tier,
      nextRunAt: digestSpecs.nextRunAt,
      pausedAt: digestSpecs.pausedAt,
      createdAt: digestSpecs.createdAt,
      updatedAt: digestSpecs.updatedAt,
      spec: digestSpecs.spec,
    })
    .from(digestSpecs)
    .where(
      and(
        eq(digestSpecs.userId, user.id),
        inArray(digestSpecs.status, ["active", "paused"])
      )
    )
    .orderBy(desc(digestSpecs.updatedAt));

  let lastBySpec = new Map<
    string,
    { shortId: string | null; status: string; runDate: string | Date; createdAt: Date }
  >();
  if (specs.length > 0) {
    const specIds = specs.map((s) => s.id);
    const runs = await db
      .select({
        specId: digestRuns.specId,
        shortId: digestRuns.shortId,
        status: digestRuns.status,
        runDate: digestRuns.runDate,
        createdAt: digestRuns.createdAt,
      })
      .from(digestRuns)
      .where(
        and(
          eq(digestRuns.userId, user.id),
          inArray(digestRuns.specId, specIds)
        )
      )
      .orderBy(desc(digestRuns.createdAt))
      .limit(specIds.length * 3);
    for (const r of runs) {
      if (!lastBySpec.has(r.specId)) lastBySpec.set(r.specId, r);
    }
  }

  const initial: BriefRow[] = specs.map((s) => {
    const last = lastBySpec.get(s.id) ?? null;
    return {
      id: s.id,
      name: s.name ?? null,
      status: s.status ?? "active",
      tier: s.tier ?? "default",
      scheduling: s.scheduling as BriefRow["scheduling"],
      spec: s.spec as BriefRow["spec"],
      nextRunAt: s.nextRunAt ? s.nextRunAt.toISOString() : null,
      pausedAt: s.pausedAt ? s.pausedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      lastRun: last
        ? {
            shortId: last.shortId,
            status: last.status,
            runDate: typeof last.runDate === "string" ? last.runDate : last.runDate.toISOString(),
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  });

  // canCreate is a quick count of the same non-archived rows — reuse what
  // we already pulled to skip an extra round-trip. CAD-212: max comes from
  // the per-user cap (1; founder/admin 2), same source as briefs.canCreate.
  const maxBriefs = maxBriefsForEmail(user.email);
  const initialCanCreate = {
    allowed: specs.length < maxBriefs,
    count: specs.length,
    max: maxBriefs,
  };

  // sql import retained so future migrations to a proper count(*) live here.
  void sql;

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="briefs" />
      <BriefsClient initial={initial} initialCanCreate={initialCanCreate} />
    </div>
  );
}
