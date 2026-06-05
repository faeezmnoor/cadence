import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";
import { UsersClient } from "./users-client";

/**
 * /admin/users — per-user cost & credit dashboard.
 *
 * Operational counterpart to /admin/cost (which is aggregate Pro-vs-Default):
 * this page is one row per user showing lifetime cost-to-us, credit balance,
 * delivery success/failure counts, and last-run recency. As paid GA approaches
 * this is the "who is costing me money?" view.
 *
 * Gating mirrors /admin/runs & /admin/cost:
 *   1. SSR auth check via createSupabaseServerClient — non-admin sees a
 *      404-shaped "not found", signed-out is bounced to /auth/sign-in.
 *   2. tRPC re-checks via adminProcedure in admin.listUsers. Double gate
 *      on purpose; the client cannot enforce its own gate.
 *
 * Data flow: client component pulls via tRPC so sort/filter toggles don't
 * require a full SSR round-trip.
 */
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
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
      <AppNav active="admin" />
      <UsersClient adminEmail={user.email ?? ""} />
    </div>
  );
}
