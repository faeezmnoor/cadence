import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/server/observability/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    // Security MEDIUM #3: strip user-content + email from outbound events.
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
