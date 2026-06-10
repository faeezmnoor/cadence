import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/server/support/contact";

export default function AuthErrorPage() {
  return (
    <main className="safe-pt safe-pb safe-px flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          That sign-in link didn&apos;t work
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          It may have expired or already been used &mdash; links work once.
          Get a new one below.
        </p>
        <p className="mt-6">
          <Link
            href="/auth/sign-in"
            className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background hover:bg-brand hover:text-brand-foreground transition"
          >
            Get a new link
          </Link>
        </p>
        <p className="mt-6 text-xs text-muted-foreground">
          Still stuck?{" "}
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
