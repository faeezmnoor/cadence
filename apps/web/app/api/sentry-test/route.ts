/**
 * Temporary Sentry smoke test route.
 *
 * Hit GET /api/sentry-test?key=<secret> to deliberately capture an
 * exception + a captureMessage with synthetic PII fields. Used once
 * to verify Sentry DSN wiring + beforeSend scrub. Delete after first
 * successful event lands in Sentry.
 */
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

const TEST_KEY = "cadence-sentry-smoke-2026-06-04";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== TEST_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  Sentry.captureException(new Error("Sentry smoke test — controlled exception"), {
    tags: { route: "api.sentry-test", purpose: "wiring-smoke" },
    extra: {
      email: "shouldbescrubbed@example.com",
      chat_content: "this user-text MUST be redacted by beforeSend",
      composed_markdown: "# secret brief content",
      notes: "user feedback notes that should not leak",
    },
  });

  Sentry.captureMessage("Sentry smoke test — controlled message", {
    level: "info",
    tags: { route: "api.sentry-test" },
  });

  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    note: "Two events sent to Sentry. Check the project's Issues tab.",
  });
}
