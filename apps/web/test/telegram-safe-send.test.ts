/**
 * Coverage for the Telegram parse-mode fallback (CAD bug 2026-06-05).
 *
 * The composer occasionally emits malformed Markdown (unbalanced `*`, `_`,
 * `` ` ``, or `[](...)`) and Telegram responds with HTTP 400 "can't parse
 * entities". safeSendTelegramMessage must:
 *   1. Detect that specific error shape.
 *   2. Retry the SAME body with `parse_mode` stripped (plain UTF-8).
 *   3. Preserve other options (reply_markup) on the retry.
 *   4. Re-throw unrelated errors (don't swallow real failures).
 */
import { describe, expect, it, vi } from "vitest";
import {
  isParseEntitiesError,
  safeSendTelegramMessage,
} from "../server/telegram/client";

/** Build a grammy-shaped error so the detector exercises the real path. */
function parseEntitiesError(offset = 3170): Error & {
  error_code: number;
  description: string;
} {
  const err = new Error(
    `Call to 'sendMessage' failed! (400: Bad Request: can't parse entities: Can't find end of the entity starting at byte offset ${offset})`
  ) as Error & { error_code: number; description: string };
  err.error_code = 400;
  err.description = `Bad Request: can't parse entities: Can't find end of the entity starting at byte offset ${offset}`;
  return err;
}

describe("isParseEntitiesError", () => {
  it("matches grammy-shaped parse error via description", () => {
    expect(isParseEntitiesError(parseEntitiesError())).toBe(true);
  });

  it("matches plain Error whose message includes the phrase", () => {
    expect(
      isParseEntitiesError(new Error("400: Bad Request: can't parse entities: foo"))
    ).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isParseEntitiesError(new Error("ECONNRESET"))).toBe(false);
    expect(isParseEntitiesError(new Error("bot was blocked by the user"))).toBe(false);
    expect(isParseEntitiesError(null)).toBe(false);
    expect(isParseEntitiesError(undefined)).toBe(false);
    expect(isParseEntitiesError({})).toBe(false);
  });
});

describe("safeSendTelegramMessage", () => {
  it("returns immediately on a successful first call (no retry)", async () => {
    const send = vi.fn().mockResolvedValueOnce({ message_id: 42 });
    const out = await safeSendTelegramMessage(send, 123, "hello", {
      parse_mode: "Markdown",
    });
    expect(out.message_id).toBe(42);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries WITHOUT parse_mode on parse-entities 400", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(parseEntitiesError(3170))
      .mockResolvedValueOnce({ message_id: 77 });

    const out = await safeSendTelegramMessage(send, 123, "broken *markdown _", {
      parse_mode: "Markdown",
    });

    expect(out.message_id).toBe(77);
    expect(send).toHaveBeenCalledTimes(2);
    // First call carried parse_mode.
    expect(send.mock.calls[0][2]).toEqual({ parse_mode: "Markdown" });
    // Second call dropped parse_mode entirely.
    expect(send.mock.calls[1][2]).toEqual({});
  });

  it("preserves reply_markup across the fallback retry", async () => {
    const replyMarkup = { inline_keyboard: [[{ text: "👍", callback_data: "x" }]] };
    const send = vi
      .fn()
      .mockRejectedValueOnce(parseEntitiesError())
      .mockResolvedValueOnce({ message_id: 1 });

    await safeSendTelegramMessage(send, 999, "body", {
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][2]).toEqual({ reply_markup: replyMarkup });
    // parse_mode must be gone on the retry.
    expect((send.mock.calls[1][2] as Record<string, unknown>).parse_mode).toBeUndefined();
  });

  it("re-throws if the fallback ALSO fails (no silent swallow)", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(parseEntitiesError())
      .mockRejectedValueOnce(new Error("bot was blocked by the user"));

    await expect(
      safeSendTelegramMessage(send, 1, "x", { parse_mode: "Markdown" })
    ).rejects.toThrow(/blocked/);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("re-throws unrelated errors WITHOUT retrying", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      safeSendTelegramMessage(send, 1, "x", { parse_mode: "Markdown" })
    ).rejects.toThrow(/ECONNRESET/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("works when no parse_mode was supplied (defensive: still detects + retries)", async () => {
    // Edge case: caller passes no parse_mode but Telegram still claims an
    // entity error (shouldn't happen, but if it does, we still recover).
    const send = vi
      .fn()
      .mockRejectedValueOnce(parseEntitiesError())
      .mockResolvedValueOnce({ message_id: 5 });
    const out = await safeSendTelegramMessage(send, 1, "x", {});
    expect(out.message_id).toBe(5);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("logs a [telegram:parse-fallback] warn line with offset and length", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi
      .fn()
      .mockRejectedValueOnce(parseEntitiesError(3170))
      .mockResolvedValueOnce({ message_id: 1 });
    await safeSendTelegramMessage(send, 1, "hello world", {
      parse_mode: "Markdown",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toMatch(/\[telegram:parse-fallback\]/);
    expect(line).toMatch(/offset=3170/);
    expect(line).toMatch(/len=11/);
    expect(line).toMatch(/parse_mode=Markdown/);
    spy.mockRestore();
  });
});
