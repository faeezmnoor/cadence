/**
 * dead-surface fix 2026-06-09: superseded design-audit-v1 §5's auto-redirect
 * to /app/link with an INLINE CTA inside BriefActions. The redirect killed
 * the Preview / Send-me-one-now surface (BriefActions only enables once
 * savedSpecId is non-null — exactly when the redirect fired). Replacement
 * behavior:
 *
 *   1. chat-client.tsx no longer calls router.push("/app/link") on
 *      confirm_and_save. The user stays on /chat.
 *   2. BriefActions renders an inline Link to /app/link when the spec is
 *      saved AND Telegram isn't linked — the explicit next action, not a
 *      mystery teleport.
 *
 * We assert on source rather than rendering the components because
 * vitest's include pattern is *.test.ts (not .tsx) and the relevant
 * surface is a single component branch — pinning it as text is the
 * cheapest regression guard.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const chatClientPath = fileURLToPath(
  new URL("../components/chat/chat-client.tsx", import.meta.url)
);
const briefActionsPath = fileURLToPath(
  new URL("../components/chat/brief-actions.tsx", import.meta.url)
);
const chatClientSource = readFileSync(chatClientPath, "utf8");
const briefActionsSource = readFileSync(briefActionsPath, "utf8");

describe("post-confirm inline CTA (no auto-redirect)", () => {
  it("chat-client does NOT auto-redirect to /app/link on confirm_and_save", () => {
    // The forbidden one-liner. Comments mentioning the historical redirect
    // are fine; the actual call site must not exist.
    expect(chatClientSource).not.toMatch(
      /^\s*router\.push\(\s*["']\/app\/link["']/m
    );
    // And explicitly does NOT push to /spec either.
    expect(chatClientSource).not.toMatch(
      /^\s*router\.push\(\s*["']\/spec["']/m
    );
  });

  it("BriefActions renders an inline /app/link CTA for saved-but-not-linked users", () => {
    // Real Link to /app/link, not a disabled <span> badge.
    expect(briefActionsSource).toMatch(/href=["']\/app\/link["']/);
    // The disabled badge must NOT come back as a dead surface.
    expect(briefActionsSource).not.toMatch(
      /brief-actions-send-disabled/
    );
    // Gated on the saved + !linked branch (the "next action when no Telegram
    // link yet" surface).
    expect(briefActionsSource).toMatch(/saved && !linked/);
  });
});
