import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { AppNav } from "@/components/nav/app-nav";

/**
 * /admin — founder-ops index (settings-surfacing v1, gap 6).
 *
 * The 8-page admin suite had no entry point anywhere, not even for the
 * admin. This hub is reachable from the conditional Admin nav tab and
 * links every existing admin page. Function over polish: no per-card
 * stats in v1 (every count is a query; the index's job is reachability).
 *
 * Gating mirrors /admin/users: SSR auth check, non-admin sees a
 * 404-shaped "not found" (no information leak that the surface exists).
 * Admin pages are exempt from the user-facing vocabulary rules
 * ("digest", "run", "eval" are fine here — internal surface).
 */
export const dynamic = "force-dynamic";

const PAGES: Array<{ href: string; title: string; blurb: string }> = [
  {
    href: "/admin/runs",
    title: "Runs",
    blurb: "Every digest run, with replay and refund.",
  },
  {
    href: "/admin/dispatch",
    title: "Dispatch",
    blurb: "Cron dispatcher trace, minute by minute.",
  },
  {
    href: "/admin/cost",
    title: "Cost",
    blurb: "Provider burn rate and circuit breaker.",
  },
  {
    href: "/admin/evals",
    title: "Evals",
    blurb: "Eval gate dashboard and brief rating.",
  },
  {
    href: "/admin/feedback",
    title: "Feedback",
    blurb: "Reaction and correction log.",
  },
  {
    href: "/admin/users",
    title: "Users",
    blurb: "Every user, linking to their runs. Grant credits here.",
  },
  {
    href: "/admin/missing-capabilities",
    title: "Missing capabilities",
    blurb: "What users asked for that Cadence can't do.",
  },
];

export default async function AdminIndexPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");
  if (!isAdminEmail(user.email)) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          The page you&apos;re looking for doesn&apos;t exist or you
          don&apos;t have access.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="admin" isAdmin />
      <main className="safe-pb mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Founder ops. Not linked anywhere user-facing.
          </p>
        </header>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PAGES.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href as never}
                className="block h-full rounded-xl border border-border bg-card p-4 transition hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
              >
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
