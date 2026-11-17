/**
 * Slice 005, review F5: a 413 on chat must not offer a Retry that resends the
 * same payload. The client hides Retry for `payload_too_large` and drops the
 * unsent user message from its local thread (the server saved nothing), so
 * the words' one action, "try a shorter one", is true.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PAYLOAD_TOO_LARGE_CODE,
  offersRetry,
  withoutUnsentMessage,
} from "@/lib/chat/error-actions";
import { PAYLOAD_TOO_LARGE_MESSAGE, payloadTooLargeResponse } from "@/server/http/body-limit";

const chatClient = readFileSync(
  fileURLToPath(new URL("../components/chat/chat-client.tsx", import.meta.url)),
  "utf8"
);

describe("chat error actions", () => {
  it("offers no Retry for a 413 and keeps it for every other code", () => {
    expect(offersRetry(PAYLOAD_TOO_LARGE_CODE)).toBe(false);
    for (const code of ["unknown", "timeout", "upstream_5xx", "rate_limited", "stream_failed"]) {
      expect(offersRetry(code)).toBe(true);
    }
  });

  it("drops only a trailing user message", () => {
    const a = { role: "assistant", content: "Daily or weekly?" };
    const u = { role: "user", content: "x".repeat(10) };
    expect(withoutUnsentMessage([a, u])).toEqual([a]);
    expect(withoutUnsentMessage([u, a])).toEqual([u, a]);
    expect(withoutUnsentMessage([])).toEqual([]);
  });

  it("matches the code the server sends", async () => {
    const body = (await payloadTooLargeResponse().json()) as { code: string };
    expect(body.code).toBe(PAYLOAD_TOO_LARGE_CODE);
  });

  it("the 413 words follow COPY_GUIDE §6–7: ≤8 words first, one spaced em dash, no exclamation", () => {
    expect(PAYLOAD_TOO_LARGE_MESSAGE).toBe("That message is too long to send. Nothing was saved — try a shorter one.");
    const first = PAYLOAD_TOO_LARGE_MESSAGE.split(". ")[0];
    expect(first.split(" ").length).toBeLessThanOrEqual(8);
    expect(PAYLOAD_TOO_LARGE_MESSAGE.split(" — ")).toHaveLength(2);
    expect(PAYLOAD_TOO_LARGE_MESSAGE).not.toContain("!");
    expect(PAYLOAD_TOO_LARGE_MESSAGE.toLowerCase()).not.toMatch(/retry|try again/);
  });

  it("chat-client shows Retry only when offersRetry allows it and drops the unsent message on a 413", () => {
    expect(chatClient).toMatch(/offersRetry\(friendlyError\.code\)\s*&&/);
    expect(chatClient).toMatch(/setMessages\(\s*\(?\w*\)?\s*=>\s*withoutUnsentMessage\(/);
    expect(chatClient).toMatch(/friendlyError\?\.code\s*!==\s*PAYLOAD_TOO_LARGE_CODE/);
  });
});
