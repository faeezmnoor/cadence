import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
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
      <AppNav active="learning" />
      <main className="safe-pb mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">
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
