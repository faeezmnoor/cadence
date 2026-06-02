"use client";

import Link from "next/link";
import { useState } from "react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

/**
 * Sign-in page. Google OAuth is the primary CTA (Faeez, 2026-06-02:
 * "Google should be our core login/authentication flow — magic link
 * barely works and is tedious."). Magic-link via signInWithOtp remains
 * as a fallback under an "or use email" divider.
 *
 * On the email form: POSTs to /api/auth/sign-in which calls
 * supabase.auth.signInWithOtp. On success we swap the UI to a
 * "check your inbox" state — no redirect, no client session yet.
 */
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "sending") return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setErrorMsg(json.error ?? "Couldn't send the link. Try again?");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Cadence
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {status === "sent" ? "Check your inbox" : "Sign in"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {status === "sent"
              ? `We sent a magic link to ${email}. Click it to continue.`
              : "We'll email you a magic link. No password required."}
          </p>
        </div>

        {status !== "sent" && (
          <>
            <GoogleSignInButton />
            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        {status !== "sent" && (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "sending"}
                className="block h-11 w-full rounded-md border border-input bg-background px-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              />
            </label>
            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "sending" ? "Sending..." : "Send magic link"}
            </button>
            {status === "error" && errorMsg && (
              <p className="text-center text-sm text-red-500" role="alert">
                {errorMsg}
              </p>
            )}
          </form>
        )}

        {status === "sent" && (
          <div className="rounded-md border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            <p>Didn&apos;t get it? Check spam, or</p>
            <button
              onClick={() => {
                setStatus("idle");
                setErrorMsg(null);
              }}
              className="mt-2 text-foreground underline-offset-4 hover:underline"
            >
              try a different email
            </button>
            .
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            ← Back home
          </Link>
        </p>
      </div>
    </main>
  );
}
