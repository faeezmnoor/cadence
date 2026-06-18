/**
 * /briefs/[id] — per-brief detail (Wave 6 / Bug 13).
 *
 * Two tabs:
 *   - Overview : the read-friendly summary (topics, schedule, tier,
 *                status). The default landing tab.
 *   - Advanced : raw JSON editor + version history. Ported from the
 *                legacy /spec page so a single power-user surface lives
 *                per-brief instead of user-globally.
 *
 * Server shell hydrates the initial brief row + first page of versions
 * so the first paint isn't a spinner. The legacy /spec page now 302s to
 * /briefs (the list), keeping any bookmarked link alive.
 */
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { digestSpecs } from "@/server/db/schema";
import { AppNav } from "@/components/nav/app-nav";
import { isProTierAlphaEnabled } from "@/server/ai/providers";
import { BriefDetailClient, type BriefRow, type VersionRow } from "./brief-detail-client";

export const dynamic = "force-dynamic";

const INITIAL_VERSION_PAGE_SIZE = 10;

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const rows = await db
    .select()
    .from(digestSpecs)
    .where(and(eq(digestSpecs.id, id), eq(digestSpecs.userId, user.id)))
    .limit(1);
  const brief = rows[0];
  if (!brief) notFound();

  const allVersions = await db
    .select({
      id: digestSpecs.id,
      version: digestSpecs.version,
      isCurrent: digestSpecs.isCurrent,
      status: digestSpecs.status,
      createdVia: digestSpecs.createdVia,
      createdAt: digestSpecs.createdAt,
    })
    .from(digestSpecs)
    .where(eq(digestSpecs.userId, user.id))
    .orderBy(desc(digestSpecs.version));

  const initialVersions: VersionRow[] = allVersions
    .slice(0, INITIAL_VERSION_PAGE_SIZE)
    .map((v) => ({
      id: v.id,
      version: v.version,
      isCurrent: v.isCurrent,
      status: v.status,
      createdVia: v.createdVia,
      createdAt: v.createdAt.toISOString(),
    }));

  const briefRow: BriefRow = {
    id: brief.id,
    name: brief.name,
    status: brief.status,
    tier: brief.tier,
    searcher: brief.searcher,
    version: brief.version,
    scheduling: brief.scheduling,
    spec: brief.spec,
    nextRunAt: brief.nextRunAt ? brief.nextRunAt.toISOString() : null,
    pausedAt: brief.pausedAt ? brief.pausedAt.toISOString() : null,
    archivedAt: brief.archivedAt ? brief.archivedAt.toISOString() : null,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="briefs" isAdmin={isAdminEmail(user.email)} />
      <BriefDetailClient
        brief={briefRow}
        initialVersions={initialVersions}
        initialVersionsTotal={allVersions.length}
        initialVersionsPageSize={INITIAL_VERSION_PAGE_SIZE}
        proTierAlphaEnabled={isProTierAlphaEnabled()}
      />
    </div>
  );
}
