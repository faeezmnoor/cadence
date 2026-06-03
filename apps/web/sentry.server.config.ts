import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/server/observability/sentry-scrub";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? "development",
    // Security MEDIUM #3: strip user-content + email from outbound events.
    beforeSend(event) {
      // Cast: scrubSentryEvent operates on a structural subset; we mutate
      // and return the same Sentry ErrorEvent shape.
      return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
    },
  });
}
