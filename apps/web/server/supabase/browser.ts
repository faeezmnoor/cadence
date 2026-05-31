import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Use from Client Components for realtime
 * subscriptions and read-only queries that should respect RLS.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    );
  }

  return createBrowserClient(url, anonKey);
}
