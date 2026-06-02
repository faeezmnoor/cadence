/**
 * Designer #3 (design-audit-v1 §3): /chat turn 0 must show a welcome
 * bubble + starter chips. Once any message exists they must hide so the
 * T-414 contextual chips can take over.
 *
 * Source-pattern test — matches the existing post-confirm-redirect style
 * because vitest's include pattern is *.test.ts and the chips live inside
 * a "use client" component that would require a full React testing-library
 * setup to render. Pinning the structural invariants here catches silent
 * regressions cheaply.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const chatClientPath = fileURLToPath(
  new URL("../components/chat/chat-client.tsx", import.meta.url)
);
const source = readFileSync(chatClientPath, "utf8");

describe("chat starter chips (Designer #3)", () => {
  it("declares exactly three starter chips", () => {
    const match = source.match(
      /STARTER_CHIPS:\s*readonly string\[\]\s*=\s*\[([\s\S]*?)\]\s*as const/
    );
    expect(match, "STARTER_CHIPS array literal").not.toBeNull();
    const body = match![1]!;
    const chips = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(chips).toHaveLength(3);
    // Positioning rule: chips MUST NOT lead with the delivery channel.
    for (const c of chips) {
      expect(c.toLowerCase()).not.toContain("telegram");
      expect(c.toLowerCase()).not.toContain("whatsapp");
    }
  });

  it("welcome bubble + chips only render when there are zero messages", () => {
    // hasMessages flag is derived from messages.length and used to gate
    // both the welcome bubble and the chip strip.
    expect(source).toMatch(/const hasMessages = messages\.length > 0/);
    expect(source).toMatch(/\{!hasMessages && \(/);
  });

  it("chip buttons fire handleSuggestion (auto-submit) and disable while streaming", () => {
    // The handler dispatches a user message via append() — same path the
    // ask_user.suggestions and T-414 chips use, so confirm_and_save and
    // draft updates flow naturally.
    expect(source).toMatch(/data-testid="chat-starter-chips"/);
    expect(source).toMatch(
      /STARTER_CHIPS\.map\([\s\S]*?onClick=\{\(\)\s*=>\s*handleSuggestion\(c\)\}[\s\S]*?disabled=\{isStreaming\}/
    );
  });

  it("welcome bubble copy reflects channel-agnostic positioning", () => {
    // No "Telegram" or "WhatsApp" in the welcome state — Cadence is
    // messaging-channel-agnostic.
    const welcomeBlock = source.match(
      /data-testid="chat-welcome"[\s\S]*?<\/div>\s*<\/div>\s*\)\}/
    );
    expect(welcomeBlock).not.toBeNull();
    const text = welcomeBlock![0].toLowerCase();
    expect(text).not.toContain("telegram");
    expect(text).not.toContain("whatsapp");
    expect(text).toContain("cadence");
  });
});
