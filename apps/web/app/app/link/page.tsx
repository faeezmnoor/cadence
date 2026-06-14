import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { digestSpecs, users } from "@/server/db/schema";
import { LinkTelegramClient } from "@/components/telegram/link-telegram-client";
import { AppNav } from "@/components/nav/app-nav";
import { DeliveryStatusCard } from "@/components/delivery/delivery-status-card";
import { DeliveryBrokenBanner } from "@/components/delivery/delivery-broken-banner";

/**
 * /app/link — Telegram linking screen.
 *
 * Designer #2 fix (post-confirm landing): users arrive here straight
 * from chat's confirm_and_save (chat-client.tsx:131). Page reads as a
 * friendly milestone, not a settings form. The connect-bot CTA is the
 * single primary action; "Linked!" state collapses to a tomorrow-promise.
 *
 * Auth-checks, then mounts the client component that issues a link token
 * via tRPC and subscribes to Realtime for instant "Linked!" feedback.
 */
export const dynamic = "force-dynamic";

export default async function LinkPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const isAdmin = isAdminEmail(user.email);

  // Settings-surfacing v1 (gaps 3 + 11): delivery-on-hold banner. Shown
  // when the pipeline escalated to delivery_broken, or when the user is
  // unlinked but holds briefs (a brand-new user mid-onboarding shouldn't
  // see a warning banner over the connect flow they're about to finish).
  const [userRows, briefRows] = await Promise.all([
    db
      .select({ state: users.state, telegramChatId: users.telegramChatId })
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
      )
      .limit(1),
  ]);
  const userRow = userRows[0];
  const broken = userRow?.state === "delivery_broken";
  const unlinkedWithBriefs =
    !broken && userRow?.telegramChatId == null && briefRows.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="link" isAdmin={isAdmin} />
      <main className="safe-pb mx-auto flex max-w-xl flex-col gap-6 px-6 py-12">
        {(broken || unlinkedWithBriefs) && (
          // showAction=false: this page IS the reconnect flow — the
          // banner explains the hold, the page below carries the action.
          <DeliveryBrokenBanner
            reason={broken ? "delivery_broken" : "unlinked"}
            showAction={false}
          />
        )}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
            <span aria-hidden="true">✓</span>
            <span>Brief setup saved</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            One more step — connect Telegram so your brief can land
          </h1>
          <p className="text-sm text-muted-foreground">
            Your brief is set up. Connect Telegram and we&rsquo;ll send your
            first sample in seconds — then your real brief arrives tomorrow
            morning.
          </p>
        </header>
        <LinkTelegramClient userId={user.id} isAdmin={isAdmin} />
        {/* Settings-surfacing v1 (gap 3): disconnect lives where the link
            status lives. Renders only when linked. */}
        <DeliveryStatusCard variant="link" />
        <p className="text-xs text-muted-foreground">
          Want to tweak it first? <Link href={"/chat" as never} className="underline underline-offset-2 hover:text-foreground">Continue the chat</Link>
        </p>
      </main>
    </div>
  );
}
