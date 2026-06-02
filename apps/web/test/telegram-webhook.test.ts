/**
 * Telegram webhook callback_query handling (T-402 / CAD-43).
 *
 * Two layers:
 *
 *   1. POST /api/telegram/webhook — secret verification. A bad/missing
 *      secret returns 401 without invoking dispatch. A valid secret
 *      returns 200 even if downstream dispatch is mocked.
 *
 *   2. dispatchTelegramUpdate(callback_query) — calls
 *      recordFeedbackCallback and answerCallbackQuery with a toast. We
 *      assert the toast text matches the vote (so the user gets the
 *      right confirmation within Telegram's 5s budget).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — module-scope so they apply to both POST and dispatch tests.
// ---------------------------------------------------------------------------

const recordFeedbackCallback = vi.fn();
vi.mock("@/server/telegram/feedback-callback", () => ({
  recordFeedbackCallback: (...args: unknown[]) =>
    recordFeedbackCallback(...(args as [unknown])),
}));

const answerCallbackQuery = vi.fn<(...args: any[]) => Promise<boolean>>(async () => true);
const sendMessage = vi.fn<(...args: any[]) => Promise<{ message_id: number }>>(async () => ({
  message_id: 1,
}));
vi.mock("@/server/telegram/client", () => ({
  isTelegramConfigured: () => true,
  getBot: () => ({
    api: { answerCallbackQuery, sendMessage },
  }),
}));

// link-token isn't exercised on the callback path but dispatch imports it.
vi.mock("@/server/telegram/link-token", () => ({
  resolveAndLinkToken: vi.fn(),
}));

beforeEach(() => {
  recordFeedbackCallback.mockReset();
  answerCallbackQuery.mockClear();
  sendMessage.mockClear();
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret-123";
});

// ---------------------------------------------------------------------------
// 1. POST /api/telegram/webhook — secret verification
// ---------------------------------------------------------------------------
describe("POST /api/telegram/webhook — auth", () => {
  it("returns 401 when the secret is missing/wrong", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const req = new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_id: 1 }),
    });
    // NextRequest is structurally compatible with the route's expectation
    // for the fields it reads (url, headers, json).
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
    expect(recordFeedbackCallback).not.toHaveBeenCalled();
  });

  it("returns 200 + invokes dispatch when X-Telegram-Bot-Api-Secret-Token matches", async () => {
    recordFeedbackCallback.mockResolvedValue({ kind: "recorded" });
    const { POST } = await import("@/app/api/telegram/webhook/route");

    const body = {
      update_id: 42,
      callback_query: {
        id: "cb-xyz",
        from: { id: 12345 },
        data: "fb:up:2f4c5a6e-1234-4567-89ab-cdef01234567",
        message: { message_id: 7, chat: { id: 12345, type: "private" } },
      },
    };

    const req = new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "test-secret-123",
      },
      body: JSON.stringify(body),
    });

    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);

    // recordFeedbackCallback got called with the parsed shape.
    expect(recordFeedbackCallback).toHaveBeenCalledTimes(1);
    expect(recordFeedbackCallback.mock.calls[0]![0]).toMatchObject({
      callbackId: "cb-xyz",
      telegramUserId: 12345,
      telegramChatId: 12345,
      runId: "2f4c5a6e-1234-4567-89ab-cdef01234567",
      vote: "up",
    });

    // answerCallbackQuery fired inside the 5s budget with a vote-shaped toast.
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery.mock.calls[0]![0]).toBe("cb-xyz");
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toMatch(/Logged.*more like this/);
  });

  it("accepts ?secret= query param as a fallback (local dev curl)", async () => {
    recordFeedbackCallback.mockResolvedValue({ kind: "recorded" });
    const { POST } = await import("@/app/api/telegram/webhook/route");

    const req = new Request(
      "http://localhost/api/telegram/webhook?secret=test-secret-123",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          update_id: 1,
          callback_query: {
            id: "cb-2",
            from: { id: 99 },
            data: "fb:love:2f4c5a6e-1234-4567-89ab-cdef01234567",
            message: { message_id: 1, chat: { id: 99, type: "private" } },
          },
        }),
      }
    );

    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(recordFeedbackCallback).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. dispatchTelegramUpdate — callback_query handling
// ---------------------------------------------------------------------------
describe("dispatchTelegramUpdate(callback_query)", () => {
  it("answers with the duplicate toast when feedback was already recorded", async () => {
    recordFeedbackCallback.mockResolvedValue({ kind: "duplicate" });
    const { dispatchTelegramUpdate } = await import("@/server/telegram/dispatch");

    await dispatchTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: "cb-dup",
        from: { id: 7 },
        data: "fb:down:2f4c5a6e-1234-4567-89ab-cdef01234567",
        message: { message_id: 1, chat: { id: 7, type: "private" } },
      },
    });

    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    // Duplicate still shows the user the same friendly confirmation so a
    // double-tap doesn't read like an error.
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toMatch(/Logged.*less like this/);
  });

  it("answers with a 'too old' toast when run is unknown", async () => {
    recordFeedbackCallback.mockResolvedValue({ kind: "unknown_run" });
    const { dispatchTelegramUpdate } = await import("@/server/telegram/dispatch");

    await dispatchTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: "cb-old",
        from: { id: 7 },
        data: "fb:skip:2f4c5a6e-1234-4567-89ab-cdef01234567",
        message: { message_id: 1, chat: { id: 7, type: "private" } },
      },
    });

    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toMatch(/too old/);
  });

  it("answers but does NOT record when callback_data is garbage", async () => {
    const { dispatchTelegramUpdate } = await import("@/server/telegram/dispatch");

    await dispatchTelegramUpdate({
      update_id: 1,
      callback_query: {
        id: "cb-bad",
        from: { id: 7 },
        data: "not-our-prefix",
        message: { message_id: 1, chat: { id: 7, type: "private" } },
      },
    });

    expect(recordFeedbackCallback).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });
});
