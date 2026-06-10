import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { LinkTelegramClient } from "@/components/telegram/link-telegram-client";
import { AppNav } from "@/components/nav/app-nav";

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

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="link" />
      <main className="safe-pb mx-auto flex max-w-xl flex-col gap-6 px-6 py-12">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-green-600/30 bg-green-50/50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">
            <span aria-hidden="true">✓</span>
            <span>Brief setup saved</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            One more step — connect Telegram so your brief can land
          </h1>
          <p className="text-sm text-muted-foreground">
            Your brief is set up. Connect Telegram and we&rsquo;ll send your
            first sample in seconds — then your real brief lands tomorrow at
            07:00 MYT.
          </p>
        </header>
        <LinkTelegramClient userId={user.id} isAdmin={isAdmin} />
        <p className="text-xs text-muted-foreground">
          Want to tweak it first? <Link href={"/chat" as never} className="underline underline-offset-2 hover:text-foreground">Continue the chat</Link>
        </p>
      </main>
    </div>
  );
}
