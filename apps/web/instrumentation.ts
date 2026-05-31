/**
 * Next.js instrumentation hook — runs once per process before any request.
 * Loads Sentry's server/edge configs lazily so dev (no DSN set) stays quiet.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
