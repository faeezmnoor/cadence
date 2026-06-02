/**
 * Designer #2 fix (design-audit-v1 §5): after confirm_and_save, the chat
 * MUST redirect to /app/link (the Telegram connect step), not /spec.
 *
 * /spec is the raw JSON page — sending users there post-onboarding was the
 * single largest conversion leak in the product. This test pins the
 * redirect string so a future refactor can't silently revert it.
 *
 * We assert on the source file rather than rendering the React component
 * because vitest's include pattern is *.test.ts (not .tsx) and the redirect
 * is a one-liner inside a useEffect — extracting it for a unit test would
 * be more indirection than value.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const chatClientPath = fileURLToPath(
  new URL("../components/chat/chat-client.tsx", import.meta.url)
);
const source = readFileSync(chatClientPath, "utf8");

describe("post-confirm redirect", () => {
  it("routes to /app/link, not /spec, after confirm_and_save", () => {
    // The exact line we care about: router.push("/app/link" ...).
    expect(source).toMatch(/router\.push\(\s*["']\/app\/link["']/);
    // And explicitly does NOT push to /spec.
    expect(source).not.toMatch(/router\.push\(\s*["']\/spec["']/);
  });

  it("guards the redirect behind confirm_and_save tool-result detection", () => {
    expect(source).toMatch(/toolName === ["']confirm_and_save["']/);
    expect(source).toMatch(/state === ["']result["']/);
  });
});
