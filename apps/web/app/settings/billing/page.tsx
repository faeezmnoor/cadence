import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";
import { isProTierAlphaEnabled } from "@/server/ai/providers";
import { BillingClient } from "./billing-client";

/**
 * Billing settings — read-only stub until Stripe MY KYC clears.
 * Shows current credit balance + ledger history. Top-up CTA disabled with
 * "Top-ups arrive when Stripe MY clears" tooltip; pack tiles render so users
 * see the future state.
 */
export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/settings/billing");

  return (
    <div className="min-h-screen bg-background">
      {/* Settings-surfacing v1 §1: Billing left the top nav and lives as a
          hub card — the section tab stays lit (active="settings") and the
          back-link mirrors the brief-detail "← All briefs" idiom. */}
      <AppNav active="settings" isAdmin={isAdminEmail(user.email)} />
      <main className="safe-pb mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <p className="text-xs">
            <Link
              href={"/settings" as never}
              className="text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              ← Settings
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            One credit, one brief delivered. Pre-paid, no subscription, cancel by stopping.
          </p>
        </header>
        {/* CAD-215: the research-depth explainer gates on the server-read
            flag — client components can't read PRO_TIER_ALPHA themselves. */}
        <BillingClient proTierAlphaEnabled={isProTierAlphaEnabled()} />
      </main>
    </div>
  );
}
