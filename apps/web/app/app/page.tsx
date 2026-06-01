import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Post-auth app shell. Lands here after the magic-link callback.
 * If unauth'd → bounce to sign-in. If auth'd → bounce to /chat (the wedge).
 *
 * Once we have more sections (settings, spec, runs history) this becomes
 * a real shell; for P1 it's just a router.
 */
export default async function AppHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  redirect("/chat");
}
