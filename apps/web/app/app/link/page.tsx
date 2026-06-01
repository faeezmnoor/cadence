import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { LinkTelegramClient } from "@/components/telegram/link-telegram-client";

/**
 * /app/link — Telegram linking screen.
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

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Link Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Cadence delivers your briefs as Telegram messages. Tap the button
          below to open Telegram and link this account in one tap.
        </p>
      </header>
      <LinkTelegramClient userId={user.id} />
    </main>
  );
}
