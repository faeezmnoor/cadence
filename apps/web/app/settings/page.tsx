import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { AppNav } from "@/components/nav/app-nav";

/**
 * QA P0 #2 — /settings index.
 *
 * MUST-SHIP #11 shipped the account.deleteSelf tRPC mutation but never
 * surfaced a UI caller. This page is the hub for every settings sub-page
 * (Learning, Billing, Danger Zone) so the deletion path has a discoverable
 * home from the app nav.
 */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=/settings");

  const sections: Array<{
    href: string;
    title: string;
    blurb: string;
    tone?: "danger";
  }> = [
    {
      href: "/settings/learning",
      title: "Learning",
      blurb: "What Cadence picked up from your thumbs and tweaks.",
    },
    {
      href: "/settings/billing",
      title: "Billing",
      blurb: "Credits, top-ups, and every brief you've spent on.",
    },
    {
      href: "/settings/danger",
      title: "Delete account",
      blurb:
        "Permanently delete your account, briefs, and learning. No grace window.",
      tone: "danger",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppNav active={null} />
      <main className="safe-pb mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account, your credits, your exit door.{" "}
            <Link
              href={"/chat" as never}
              className="underline-offset-4 hover:underline"
            >
              Back to chat
            </Link>
            .
          </p>
        </header>

        <ul className="space-y-3">
          {sections.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href as never}
                className={
                  s.tone === "danger"
                    ? "block rounded-xl border border-destructive/30 bg-destructive/5 p-5 transition hover:border-destructive/60 hover:bg-destructive/10"
                    : "block rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30 hover:bg-muted/40"
                }
              >
                <p
                  className={
                    s.tone === "danger"
                      ? "text-sm font-semibold text-destructive"
                      : "text-sm font-semibold"
                  }
                >
                  {s.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{s.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
