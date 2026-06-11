"use client";

/**
 * Primary sign-in CTA. Kicks off Supabase's Google OAuth PKCE flow.
 *
 * Why this is the primary path (not magic link):
 *   - Magic link is tedious — inbox round-trip, spam folders, expired codes.
 *   - Most of our ICP (business owners) already have a Google account.
 *   - OAuth resolves email-verification + identity in one tap, no DNS games.
 *
 * Implementation notes:
 *   - We use the browser Supabase client (cookies are SSR-safe via @supabase/ssr).
 *   - `redirectTo` is computed at click time from window.location.origin so we
 *     work in localhost, preview deployments, and prod without env juggling.
 *   - The /auth/callback route already handles the PKCE code exchange — same
 *     `exchangeCodeForSession` call works for both magic-link and OAuth.
 *   - Account linking: Supabase's "Link a new identity to an existing user"
 *     setting (Authentication → Sign In / Up → "Allow manual linking") is left
 *     at the default. With email-confirmed identities the user gets linked by
 *     email automatically; otherwise a new auth.users row is created and the
 *     0013 trigger grants 3 credits like any signup.
 */

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export function GoogleSignInButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback${
        next ? `?next=${encodeURIComponent(next)}` : ""
      }`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
      // On success the browser is redirected to Google — no further work.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Google sign-in");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-md border border-input bg-background px-6 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Continue with Google"
      >
        <GoogleGlyph />
        <span>{loading ? "Redirecting…" : "Continue with Google"}</span>
      </button>
      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Inline Google "G" mark. Kept as SVG (not <img>) so we don't ship a binary
 * asset or add an <Image> remote-host config. Colours match Google's brand
 * guidelines for the official G logo.
 */
function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6154z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}
