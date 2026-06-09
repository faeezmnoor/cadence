/**
 * /tune freeform command (T-403 / CAD-44).
 *
 * Two layers:
 *
 *   1. parseTuneCommand — pure parser. `/tune` with no body returns "".
 *      `/tune foo bar` returns "foo bar". Non-/tune messages return null.
 *      `/tune@CadenceBot foo` (group-mention form) strips the @mention.
 *
 *   2. dispatchTelegramUpdate('/tune …') — full flow. Asserts:
 *        - empty body → usage hint reply, NO db write
 *        - linked user + body → learning_log insert + ack echo
 *        - unlinked telegram chat → unlinked reply, NO learning_log insert
 *      DB writes are mocked at @/server/db/client.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseTuneCommand } from "@/server/telegram/tune-command";

// ---------------------------------------------------------------------------
// Pure parser
// ---------------------------------------------------------------------------
describe("parseTuneCommand", () => {
  it("returns null for non-/tune messages", () => {
    expect(parseTuneCommand("/start")).toBeNull();
    expect(parseTuneCommand("just a feedback message")).toBeNull();
    expect(parseTuneCommand("/tuned")).toBeNull(); // no word-boundary match
  });

  it("returns '' for bare /tune with no body", () => {
    expect(parseTuneCommand("/tune")).toBe("");
    expect(parseTuneCommand("  /tune   ")).toBe("");
  });

  it("captures freeform body after /tune", () => {
    expect(parseTuneCommand("/tune more on TikTok Shop EU")).toBe(
      "more on TikTok Shop EU"
    );
    expect(parseTuneCommand("/tune  less crypto  ")).toBe("less crypto");
  });

  it("strips @BotName for group-mention form", () => {
    expect(parseTuneCommand("/tune@CadenceBot more palm oil")).toBe(
      "more palm oil"
    );
  });

  it("handles multi-line freeform bodies", () => {
    expect(parseTuneCommand("/tune line one\nline two")).toBe(
      "line one\nline two"
    );
  });
});

// ---------------------------------------------------------------------------
// Dispatcher integration
// ---------------------------------------------------------------------------

// Mock the DB so we can assert insert payloads without standing up Postgres.
// We model db.select(...).from(...).where(...).limit(...) and
// db.insert(...).values(...).
type FakeRow = { id: string };
const selectChain = {
  rows: [] as FakeRow[],
  from: vi.fn(() => selectChain),
  where: vi.fn(() => selectChain),
  limit: vi.fn(async () => selectChain.rows),
};
const insertCall = vi.fn();
const insertChain = {
  values: vi.fn(async (v: unknown) => {
    insertCall(v);
    return [];
  }),
};

vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
  },
}));

// Schema imports are read for column references inside the handler — we
// don't need real values, but vitest will resolve them from the source.

// link-token + feedback-callback aren't exercised by /tune but dispatch imports them.
vi.mock("@/server/telegram/link-token", () => ({
  resolveAndLinkToken: vi.fn(),
}));
vi.mock("@/server/telegram/feedback-callback", () => ({
  recordFeedbackCallback: vi.fn(),
}));

const sendMessage = vi.fn<(...args: any[]) => Promise<{ message_id: number }>>(
  async () => ({ message_id: 1 })
);
const answerCallbackQuery = vi.fn<(...args: any[]) => Promise<boolean>>(
  async () => true
);
vi.mock("@/server/telegram/client", () => ({
  isTelegramConfigured: () => true,
  getBot: () => ({ api: { sendMessage, answerCallbackQuery } }),
}));

beforeEach(() => {
  selectChain.rows = [];
  selectChain.from.mockClear();
  selectChain.where.mockClear();
  selectChain.limit.mockClear();
  insertCall.mockClear();
  insertChain.values.mockClear();
  sendMessage.mockClear();
});

function tuneUpdate(chatId: number, text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, first_name: "Faeez" },
      text,
    },
  };
}

describe("dispatchTelegramUpdate(/tune …)", () => {
  it("writes to learning_log + sends ack when user is linked", async () => {
    selectChain.rows = [{ id: "user-uuid-1" }];
    const { dispatchTelegramUpdate } = await import("@/server/telegram/dispatch");

    await dispatchTelegramUpdate(tuneUpdate(12345, "/tune more on TikTok"));

    // DB insert hit with the right payload.
    expect(insertCall).toHaveBeenCalledTimes(1);
    expect(insertCall.mock.calls[0]![0]).toMatchObject({
      userId: "user-uuid-1",
      source: "tune_command",
      rawText: "more on TikTok",
    });

    // Ack reply went out with the warm confirmation + heard echo.
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, replyText] = sendMessage.mock.calls[0]!;
    expect(replyText).toMatch(/bias your next briefs/i);
    expect(replyText).toMatch(/more on TikTok/);
  });

  it("sends usage hint and does NOT write when /tune has no body", async () => {
    selectChain.rows = [{ id: "user-uuid-1" }];
    const { dispatchTelegramUpdate } = await import("@/server/telegram/dispatch");

    await dispatchTelegramUpdate(tuneUpdate(12345, "/tune"));

    expect(insertCall).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![1]).toMatch(/Try `\/tune/);
  });

  it("sends unlinked reply and does NOT write when chat isn't linked", async () => {
    selectChain.rows = []; // no user row → unknown_user
    const { dispatchTelegramUpdate } = await import("@/server/telegram/dispatch");

    await dispatchTelegramUpdate(tuneUpdate(99999, "/tune more palm oil"));

    expect(insertCall).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    // Wave 4 CMO copy diff §10: "isn't linked" → "isn't connected".
    expect(sendMessage.mock.calls[0]![1]).toMatch(/isn't connected/i);
  });
});
