/**
 * Scaffolding-adapter contract (CAD-207).
 *
 * WhatsApp / Email / Slack adapters are registered so the shared invariant
 * suite exercises their formatters, but they have NO vendor integration:
 * `send()` must throw a descriptive error rather than silently no-op (a
 * silent no-op would burn a credit on an undelivered brief if a spec ever
 * pointed at an unwired channel).
 */
import { describe, expect, it } from "vitest";
import { whatsappAdapter } from "@/server/channels/whatsapp";
import { emailAdapter } from "@/server/channels/email";
import { slackAdapter } from "@/server/channels/slack";

describe("scaffolding adapters — send() throws until wired", () => {
  it("whatsapp send() rejects with a scaffolding error", async () => {
    await expect(
      whatsappAdapter.send(
        { text: "hi" },
        { channel: "whatsapp", phoneE164: "+60123456789" }
      )
    ).rejects.toThrow(/scaffolding/i);
  });

  it("email send() rejects with a scaffolding error", async () => {
    await expect(
      emailAdapter.send(
        { text: "hi" },
        { channel: "email", to: "user@example.com" }
      )
    ).rejects.toThrow(/scaffolding/i);
  });

  it("slack send() rejects with a scaffolding error", async () => {
    await expect(
      slackAdapter.send(
        { text: "hi" },
        { channel: "slack", channelId: "C0123456789" }
      )
    ).rejects.toThrow(/scaffolding/i);
  });
});
