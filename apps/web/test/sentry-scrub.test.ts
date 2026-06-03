/**
 * Sentry PII scrubber — Security MEDIUM #3.
 */
import { describe, it, expect } from "vitest";
import { scrubSentryEvent } from "../server/observability/sentry-scrub";

describe("scrubSentryEvent", () => {
  it("redacts email in extra", () => {
    const ev = { extra: { email: "alice@example.com", other: "ok" } };
    const out = scrubSentryEvent(ev);
    expect(out.extra?.email).toBe("[redacted]");
    expect(out.extra?.other).toBe("ok");
  });

  it("redacts chat_content, composed_markdown, notes (case-insensitive)", () => {
    const ev = {
      extra: {
        chat_content: "secret user turn",
        Composed_Markdown: "## Brief body",
        NOTES: "private",
        keep: 1,
      },
    };
    const out = scrubSentryEvent(ev);
    expect(out.extra?.chat_content).toBe("[redacted]");
    expect(out.extra?.Composed_Markdown).toBe("[redacted]");
    expect(out.extra?.NOTES).toBe("[redacted]");
    expect(out.extra?.keep).toBe(1);
  });

  it("scrubs nested objects in contexts", () => {
    const ev = {
      contexts: {
        request: { url: "/x", email: "bob@example.com" },
        payload: { body: { composed_markdown: "x", topic: "y" } },
      },
    };
    const out = scrubSentryEvent(ev);
    expect((out.contexts?.request as Record<string, unknown>).email).toBe("[redacted]");
    expect((out.contexts?.request as Record<string, unknown>).url).toBe("/x");
    const body = (out.contexts?.payload as { body: Record<string, unknown> }).body;
    expect(body.composed_markdown).toBe("[redacted]");
    expect(body.topic).toBe("y");
  });

  it("hashes user.email deterministically", () => {
    const ev1 = { user: { id: "u1", email: "alice@example.com" } };
    const ev2 = { user: { id: "u2", email: "ALICE@example.com" } };
    const out1 = scrubSentryEvent(ev1);
    const out2 = scrubSentryEvent(ev2);
    expect(out1.user?.email).not.toBe("alice@example.com");
    expect(out1.user?.email).toMatch(/^email-fp:[0-9a-f]+$/);
    // case-insensitive -> same fingerprint
    expect(out1.user?.email).toBe(out2.user?.email);
    expect(out1.user?.id).toBe("u1");
  });

  it("is a no-op on minimal events", () => {
    const ev = {};
    const out = scrubSentryEvent(ev);
    expect(out).toEqual({});
  });
});
