export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in link invalid</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The magic link is expired or already used. Request a new one.
        </p>
      </div>
    </main>
  );
}
