import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * tRPC request context. Resolves the Supabase user (if any) once per request
 * so procedures don't each re-parse cookies.
 */
export async function createTRPCContext(_opts: FetchCreateContextFnOptions) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { user, supabase };
  } catch {
    // Supabase env not configured yet (pre-provisioning) — degrade gracefully.
    return { user: null, supabase: null };
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
