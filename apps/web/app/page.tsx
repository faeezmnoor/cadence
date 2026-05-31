import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Cadence</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Your industry, briefed daily.
        </h1>
        <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
          Tell Cadence what to watch. It learns what you care about and delivers a sharp,
          personal market brief to your Telegram every morning.
        </p>
        <div className="mt-8 inline-flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Foundation phase — auth, chat, and Telegram link coming next.
        </div>
      </div>
    </main>
  );
}
