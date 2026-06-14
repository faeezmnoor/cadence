import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { RunsClient } from "./runs-client";
import { AppNav } from "@/components/nav/app-nav";

/**
 * T-304 (CAD-39): /admin/runs — paginated runs viewer.
 *
 * Gating layers:
 *   1. SSR: `createSupabaseServerClient().auth.getUser()` — signed-out users
 *      are bounced to /auth/sign-in; non-admin signed-in users see a 404-ish
 *      "not found" message rendered server-side (no leak about the route).
 *   2. tRPC: `admin.listRuns` re-checks via `adminProcedure`. The double
 *      gate is intentional — the client can't be trusted to enforce its own
 *      gate, and we don't want to ship the bundle to non-admins either.
 *
 * Data flow matches the existing /spec page: SSR the first page, then hand
 * off to a "use client" component that uses the tRPC client for pagination
 * + filter toggling.
 */
export const dynamic = "force-dynamic";

export default async function AdminRunsPage() {
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

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="admin" isAdmin />
      <RunsClient adminEmail={user.email ?? ""} />
    </div>
  );
}
