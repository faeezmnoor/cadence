import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { digestSpecs, users } from "@/server/db/schema";
import { AppNav } from "@/components/nav/app-nav";
import { AccountTimezone } from "@/components/settings/account-timezone";
import { TimezoneGuard } from "@/components/settings/timezone-guard";
import { DeliveryStatusCard } from "@/components/delivery/delivery-status-card";

/**
 * Settings-surfacing v1 — the hub (design §2), now reachable from the
 * Settings tab in the app nav (gap 2; the PDPA delete path is ≤2 clicks
 * from any authed page).
 *
 * Card order is frequency-of-need (PRD §2): Account → Delivery →
 * Learning → Billing → Delete account (destructive last, visually
 * separated). Account and Delivery edit in place; Learning and Billing
 * stay link-cards to their existing pages — one door per surface.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/settings");
  const isAdmin = isAdminEmail(user.email);

  const [userRows, briefRows] = await Promise.all([
    db
      .select({
        timezone: users.timezone,
        creditsBalance: users.creditsBalance,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    db
      .select({ id: digestSpecs.id })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, user.id),
          inArray(digestSpecs.status, ["active", "paused"])
        )
      ),
  ]);
  const timezone = userRows[0]?.timezone ?? "Asia/Kuala_Lumpur";
  const creditsBalance = userRows[0]?.creditsBalance ?? null;
  const hasBriefs = briefRows.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="settings" isAdmin={isAdmin} />
      <main className="safe-pb mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account, delivery, and credits.
          </p>
        </header>

        {/* CPO HIGH-1: capture + suggest banner via the shared guard
            (also mounted on /chat and /briefs). */}
        <TimezoneGuard savedTimezone={timezone} hasBriefs={hasBriefs} />

        <div className="space-y-3">
          {/* Account — inline card (email read-only + timezone control). */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account
            </h2>
            <p className="mt-2 text-sm text-foreground">{user.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signed in with a magic link. Need to change your email? Contact{" "}
              <a
                href="mailto:support@cadence.news"
                className="underline underline-offset-2 hover:text-foreground"
              >
                support@cadence.news
              </a>
              .
            </p>
            {/* key: the guard's silent capture router.refresh()es this
                page — remount the select so it shows the captured zone. */}
            <AccountTimezone key={timezone} initialTimezone={timezone} />
          </section>

          {/* Delivery — inline status card; /app/link keeps the connect flow. */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Delivery
            </h2>
            <DeliveryStatusCard variant="hub" />
          </section>

          {/* Learning — link card, unchanged destination. */}
          <Link
            href={"/settings/learning" as never}
            className="block rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <p className="text-sm font-semibold">Learning</p>
            <p className="mt-1 text-sm text-muted-foreground">
              What Cadence picked up from your reactions and corrections.
            </p>
          </Link>

          {/* Billing — link card with the live balance line (design §2). */}
          <Link
            href={"/settings/billing" as never}
            className="block rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <p className="text-sm font-semibold">Billing</p>
            {creditsBalance != null && (
              <p className="mt-1 text-sm text-foreground tabular-nums">
                {creditsBalance} credit{creditsBalance === 1 ? "" : "s"} · 1
                credit = 1 brief
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Credits, top-ups, and every brief you&apos;ve spent on.
            </p>
          </Link>

          {/* Delete account — destructive, last, visually separated. */}
          <Link
            href={"/settings/danger" as never}
            className="block rounded-xl border border-destructive/30 bg-destructive/5 p-5 transition hover:border-destructive/60 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <p className="text-sm font-semibold text-destructive">
              Delete account
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanently delete your account, briefs, and everything Cadence
              has learned. It can&apos;t be undone.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
