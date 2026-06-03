import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";
import {
  proTierAlphaReady,
  recentRatedBriefs,
  MIN_SAMPLES_PER_TIER,
  MIN_LEAD,
  WINDOW_DAYS,
} from "@/server/evals/pro-eval-gate";
import { EvalsClient } from "./evals-client";

/**
 * CAD-90: /admin/evals — Pro tier eval gate dashboard.
 *
 * Auth pattern mirrors /admin/runs: SSR Supabase user check + isAdminEmail
 * gate; non-admins see a soft 404. Data is fetched server-side because the
 * helper hits raw SQL — no need to expose it through tRPC unless we end up
 * with admin tooling that mutates the gate (we don't; this is observational).
 */
export const dynamic = "force-dynamic";

export default async function AdminEvalsPage() {
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

  const [gate, recent] = await Promise.all([
    proTierAlphaReady(),
    recentRatedBriefs(10),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="admin" />
      <EvalsClient
        gate={gate}
        recent={recent}
        config={{
          minSamplesPerTier: MIN_SAMPLES_PER_TIER,
          minLead: MIN_LEAD,
          windowDays: WINDOW_DAYS,
        }}
      />
    </div>
  );
}
