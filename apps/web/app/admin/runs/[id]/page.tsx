import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";
import { RunDetailClient } from "./run-detail-client";

/**
 * Evals Phase 0: /admin/runs/[id] — per-run viewer with rating form.
 *
 * Gating layers mirror /admin/runs (T-304):
 *   1. SSR auth: unauthenticated -> sign-in; non-admin -> opaque 404 so the
 *      route's existence isn't leaked.
 *   2. tRPC: `admin.getRun` / `admin.rateBrief` re-check via
 *      `adminProcedure`. Belt + suspenders.
 *
 * The client component owns data fetching (admin.getRun) + rating UX —
 * mirrors the runs-client pattern, lets us pagination-cache-invalidate on
 * rating writes.
 */
export const dynamic = "force-dynamic";

export default async function AdminRunDetailPage({
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
  if (!isAdminEmail(user.email)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="admin" isAdmin />
      <RunDetailClient runId={id} adminEmail={user.email ?? ""} />
    </div>
  );
}
