import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { FeedbackEvalClient } from "./feedback-client";

/**
 * T-407 (CAD-48): /admin/feedback — feedback-loop eval viewer.
 *
 * Same gating pattern as /admin/runs (T-304):
 *   1. SSR auth check via Supabase; signed-out -> /auth/sign-in.
 *   2. Non-admin signed-in users get a 404-ish "not found" block.
 *   3. The tRPC procedure (admin.listFeedbackEvals) re-checks via
 *      adminProcedure — defense in depth.
 */
export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
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

  return <FeedbackEvalClient adminEmail={user.email ?? ""} />;
}
