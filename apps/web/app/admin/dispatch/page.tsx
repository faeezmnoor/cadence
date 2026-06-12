/**
 * Phase B T4 — /admin/dispatch: cron dispatcher trace.
 *
 * Sibling of /admin/runs. Last N minutes of cron activity derived from
 * `digest_runs.created_at` grouped by minute. Useful when a brief
 * fails to dispatch and you need to triage WHY — see which minutes
 * the dispatcher claimed rows on, where failures clustered, and the
 * sample last_error per minute.
 *
 * Gating mirrors /admin/runs:
 *   1. SSR auth check (redirect / not-found).
 *   2. tRPC `admin.dispatchTrace` re-checks via `adminProcedure`.
 */
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";
import { DispatchClient } from "./dispatch-client";

export const dynamic = "force-dynamic";

export default async function AdminDispatchPage() {
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
      <DispatchClient />
    </div>
  );
}
