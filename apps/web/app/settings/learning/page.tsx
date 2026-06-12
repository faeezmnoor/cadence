import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";
import { LearningClient } from "./learning-client";

/**
 * Stream E #4 — "What I've learned about you" surface (PM audit G3).
 *
 * Self-learning is Cadence's headline claim. If users can't see what we
 * learned, they can't trust the claim. This page shows:
 *   - distilled preference bullets (consumed LearningLog -> users.distilled_prefs)
 *   - last 5 raw tunes / feedback inputs with timestamps + distill status
 */
export default async function LearningPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/settings/learning");

  return (
    <div className="min-h-screen bg-background">
      {/* Settings-surfacing v1 §1: Learning left the top nav and lives as
          a hub card — section tab stays lit, back-link returns to the hub. */}
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
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            What Cadence learned about you
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every thumb and every <code>/tune</code> shifts tomorrow&rsquo;s brief.
            Here&rsquo;s what stuck.
          </p>
        </header>
        <LearningClient />
      </main>
    </div>
  );
}
