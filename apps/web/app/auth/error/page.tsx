import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/server/support/contact";

export default function AuthErrorPage() {
  return (
    <main className="safe-pt safe-pb safe-px flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in link invalid</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The magic link is expired or already used. Request a new one.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Stuck?{" "}
          <a
            href={SUPPORT_MAILTO}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </main>
  );
}
