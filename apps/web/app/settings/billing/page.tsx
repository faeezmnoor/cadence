import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { AppNav } from "@/components/nav/app-nav";
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
      <AppNav active="billing" />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your credit balance and transaction history. One credit = one brief delivered.
          </p>
        </header>
        <BillingClient />
      </main>
    </div>
  );
}
