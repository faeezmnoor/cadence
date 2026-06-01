import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * POST /auth/sign-in
 * body: { email: string }
 *
 * Sends a magic link to the email. The link redirects to /auth/callback,
 * which exchanges the code for a session.
 *
 * The full sign-in UX (the form, the "check your inbox" screen) belongs in
 * T-102; this route is the server-side wiring T-005 requires.
 */
export async function POST(request: NextRequest) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { origin } = new URL(request.url);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
