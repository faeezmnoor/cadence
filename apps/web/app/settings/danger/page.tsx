import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { AppNav } from "@/components/nav/app-nav";
import { DangerZoneClient } from "./danger-client";

/**
 * QA P0 #2 — Danger zone / right-to-erasure.
 *
 * Hub for irreversible account operations. Today: "Delete my account".
 * Wires the existing trpc.account.deleteSelf mutation behind a typed
 * confirmation dialog. On success the client signs out and lands on
 * `/?deleted=1` so the marketing page can render a goodbye.
 */
export default async function DangerSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/settings/danger");

  return (
    <div className="min-h-screen bg-background">
      <AppNav active={null} />
      <main className="safe-pb mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="text-xs">
            <Link
              href={"/settings" as never}
              className="text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              ← Settings
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Danger zone
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This can&apos;t be undone. Read what gets deleted, then decide.
          </p>
        </header>

        <DangerZoneClient userEmail={user.email ?? ""} />
      </main>
    </div>
  );
}
