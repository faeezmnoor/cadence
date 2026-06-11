/**
 * Reply-to-brief capture with confirm (CAD-220, Part 1).
 *
 * Three layers:
 *
 *   1. Pure helpers — tn: callback encode/parse (64-byte budget), snippet
 *      sanitization bounds (≤180 echo, ≤300 stored, no newlines/backticks),
 *      confirm-text round-trip (the confirm message ITSELF stores the
 *      pending note — no DB pending state).
 *
 *   2. dispatchTelegramUpdate(free text) — reply matching one of the
 *      user's briefs sends the confirm keyboard and writes NOTHING;
 *      non-reply free text and foreign-chat replies fall through to
 *      MSG_UNKNOWN.
 *
 *   3. dispatchTelegramUpdate(callback_query tn:yes / tn:no) — Save writes
 *      a bounded learning_log row (source='telegram_reply') + toast + edits
 *      the confirm message; Ignore writes nothing.
 *
 * DB is mocked at @/server/db/client (module boundary, per CLAUDE.md);
 * select results are queued because the capture path does two lookups
 * (user by chat, then run by user+message).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildConfirmText,
  buildSnippet,
  buildTuneNoteKeyboard,
  encodeTuneNoteCallback,
  extractSnippetFromConfirmText,
  parseTuneNoteCallback,
  sanitizeNoteText,
  CONFIRM_PROMPT_PREFIX,
  NOTE_MAX_CHARS,
  REPLY_CAPTURE_COPY,
  SNIPPET_MAX_CHARS,
  TELEGRAM_REPLY_SOURCE,
} from "@/server/channels/telegram/inbound/reply-capture";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Queue of select results: each `.limit()` call shifts the next entry.
// Order on the capture path: 1) users by chat, 2) digest_runs by user+msg.
let selectResults: unknown[][] = [];
const selectChain = {
  from: vi.fn(() => selectChain),
  where: vi.fn(() => selectChain),
  orderBy: vi.fn(() => selectChain),
  limit: vi.fn(async () => selectResults.shift() ?? []),
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

// Event publish is fire-and-forget; assert it without touching Inngest.
const emitLearningSignal = vi.fn(async (_userId: string) => undefined);
vi.mock("@/server/inngest/learning-signal", () => ({
  LEARNING_SIGNAL_EVENT: "learning/signal.recorded",
  emitLearningSignal: (...args: unknown[]) =>
    emitLearningSignal(...(args as [string])),
}));

// link-token + feedback-callback aren't exercised here but dispatch imports them.
vi.mock("@/server/channels/telegram/inbound/link-token", () => ({
  resolveAndLinkToken: vi.fn(),
}));
vi.mock("@/server/channels/telegram/inbound/feedback-callback", () => ({
  recordFeedbackCallback: vi.fn(),
}));

const sendMessage = vi.fn<(...args: any[]) => Promise<{ message_id: number }>>(
  async () => ({ message_id: 99 })
);
const answerCallbackQuery = vi.fn<(...args: any[]) => Promise<boolean>>(
  async () => true
);
const editMessageText = vi.fn<(...args: any[]) => Promise<boolean>>(
  async () => true
);
// Spread the actual module so safeSendTelegramMessage (used by the channel
// adapter, CAD-207) stays real; only the bot + config check are swapped.
vi.mock("@/server/channels/telegram/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/channels/telegram/client")>(
    "@/server/channels/telegram/client"
  );
  return {
    ...actual,
    isTelegramConfigured: () => true,
    getBot: () => ({
      api: { sendMessage, answerCallbackQuery, editMessageText },
    }),
  };
});

beforeEach(() => {
  selectResults = [];
  insertCall.mockClear();
  insertChain.values.mockClear();
  emitLearningSignal.mockClear();
  sendMessage.mockClear();
  answerCallbackQuery.mockClear();
  editMessageText.mockClear();
});

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------

describe("tn: callback encoding", () => {
  it("encodes yes/no inside the 64-byte callback_data budget", () => {
    expect(encodeTuneNoteCallback("yes")).toBe("tn:yes");
    expect(encodeTuneNoteCallback("no")).toBe("tn:no");
    expect(Buffer.byteLength("tn:yes", "utf8")).toBeLessThanOrEqual(64);
  });

  it("parses only exact tn: values", () => {
    expect(parseTuneNoteCallback("tn:yes")).toBe("yes");
    expect(parseTuneNoteCallback("tn:no")).toBe("no");
    expect(parseTuneNoteCallback("tn:maybe")).toBeNull();
    expect(parseTuneNoteCallback("fb:up:whatever")).toBeNull();
    expect(parseTuneNoteCallback(undefined)).toBeNull();
    expect(parseTuneNoteCallback(null)).toBeNull();
  });

  it("never collides with the fb: vote prefix", () => {
    const keyboard = buildTuneNoteKeyboard();
    const datas = keyboard.inline_keyboard.flat().map((b) => b.callback_data);
    expect(datas).toEqual(["tn:yes", "tn:no"]);
    for (const d of datas) expect(d.startsWith("fb:")).toBe(false);
  });
});

describe("sanitization + truncation bounds", () => {
  it("strips newlines and backticks, collapses whitespace", () => {
    expect(sanitizeNoteText("less\ncrypto, ```more``` \t palm  oil")).toBe(
      "less crypto, more palm oil"
    );
  });

  it("caps the echoed snippet at 180 chars", () => {
    const long = "x".repeat(400);
    const snippet = buildSnippet(long);
    expect(snippet.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("leaves short text untouched", () => {
    expect(buildSnippet("more on TikTok Shop EU")).toBe("more on TikTok Shop EU");
  });
});

describe("confirm-text round-trip (Telegram is the storage)", () => {
  it("builds the exact confirm shape", () => {
    expect(buildConfirmText("less crypto")).toBe(
      'Save this as a standing note for your briefs?\n\n"less crypto"'
    );
  });

  it("extracts the snippet back out", () => {
    expect(extractSnippetFromConfirmText(buildConfirmText("less crypto"))).toBe(
      "less crypto"
    );
  });

  it("round-trips snippets containing double quotes", () => {
    const snippet = 'more "advanced research" style depth';
    expect(extractSnippetFromConfirmText(buildConfirmText(snippet))).toBe(snippet);
  });

  it("rejects non-confirm messages (already-resolved or foreign text)", () => {
    expect(extractSnippetFromConfirmText('💾 Saved: "less crypto"')).toBeNull();
    expect(extractSnippetFromConfirmText("Not saved.")).toBeNull();
    expect(extractSnippetFromConfirmText(undefined)).toBeNull();
    expect(extractSnippetFromConfirmText(CONFIRM_PROMPT_PREFIX)).toBeNull();
    expect(extractSnippetFromConfirmText(`${CONFIRM_PROMPT_PREFIX}\n\n""`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Free-text dispatch — reply matching vs fallbacks
// ---------------------------------------------------------------------------

function textUpdate(
  chatId: number,
  text: string,
  replyToMessageId?: number
) {
  return {
    update_id: 1,
    message: {
      message_id: 500,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, first_name: "Faeez" },
      text,
      ...(replyToMessageId !== undefined
        ? { reply_to_message: { message_id: replyToMessageId } }
        : {}),
    },
  };
}

describe("dispatchTelegramUpdate — reply to a delivered brief", () => {
  it("sends the confirm keyboard and writes NOTHING when the reply matches the user's brief", async () => {
    selectResults = [
      [{ id: "user-uuid-1" }], // users by telegram_chat_id
      [{ id: "run-uuid-1" }], // digest_runs by user_id + telegram_message_id
    ];
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(textUpdate(12345, "more shipping-lane news", 777));

    // Confirm prompt with the quoted snippet, exact shape.
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [sentChatId, sentText, sentOpts] = sendMessage.mock.calls[0]!;
    expect(sentChatId).toBe(12345);
    expect(sentText).toBe(
      'Save this as a standing note for your briefs?\n\n"more shipping-lane news"'
    );
    // 2-button [💾 Save] [Ignore] keyboard rides along.
    expect(sentOpts?.reply_markup).toEqual(buildTuneNoteKeyboard());

    // The whole point: NO learning_log write before the user confirms.
    expect(insertCall).not.toHaveBeenCalled();
    expect(emitLearningSignal).not.toHaveBeenCalled();
  });

  it("caps the confirm snippet at 180 chars for long replies", async () => {
    selectResults = [[{ id: "user-uuid-1" }], [{ id: "run-uuid-1" }]];
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(textUpdate(12345, "y".repeat(400), 777));

    const [, sentText] = sendMessage.mock.calls[0]!;
    const echoed = extractSnippetFromConfirmText(sentText);
    expect(echoed).not.toBeNull();
    expect(echoed!.length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
    expect(insertCall).not.toHaveBeenCalled();
  });

  it("falls through to MSG_UNKNOWN for non-reply free text", async () => {
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(textUpdate(12345, "just some thoughts"));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![1]).toMatch(
      /reply directly to a brief to tell me what to change/
    );
    expect(insertCall).not.toHaveBeenCalled();
  });

  it("falls through to MSG_UNKNOWN when the chat isn't linked (foreign chat)", async () => {
    selectResults = [[]]; // no user for this telegram_chat_id
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(textUpdate(666, "trying to inject", 777));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![1]).toMatch(/reply directly to a brief/);
    expect(insertCall).not.toHaveBeenCalled();
  });

  it("falls through to MSG_UNKNOWN when the replied-to message isn't one of the user's briefs", async () => {
    selectResults = [
      [{ id: "user-uuid-1" }], // chat is linked…
      [], // …but the message id doesn't match any of THEIR digest_runs
    ];
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(textUpdate(12345, "reply to a forwarded brief", 888));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![1]).toMatch(/reply directly to a brief/);
    expect(insertCall).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Confirm keyboard — tn:yes / tn:no callbacks
// ---------------------------------------------------------------------------

function tnCallback(decision: "yes" | "no", messageText: string | undefined) {
  return {
    update_id: 2,
    callback_query: {
      id: "cb-tn-1",
      from: { id: 12345 },
      data: `tn:${decision}`,
      message: {
        message_id: 600,
        chat: { id: 12345, type: "private" },
        ...(messageText !== undefined ? { text: messageText } : {}),
      },
    },
  };
}

describe("dispatchTelegramUpdate — tn:yes (Save)", () => {
  it("writes a bounded learning_log row, toasts, and edits the confirm message", async () => {
    selectResults = [[{ id: "user-uuid-1" }]]; // user by chat
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(
      tnCallback("yes", buildConfirmText("more shipping-lane news"))
    );

    // learning_log write: source + bounded, sanitized text.
    expect(insertCall).toHaveBeenCalledTimes(1);
    const row = insertCall.mock.calls[0]![0] as {
      userId: string;
      source: string;
      rawText: string;
    };
    expect(row).toMatchObject({
      userId: "user-uuid-1",
      source: TELEGRAM_REPLY_SOURCE,
      rawText: "more shipping-lane news",
    });
    expect(row.rawText.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
    expect(row.rawText).not.toMatch(/[`\n]/);

    // Distill signal fired for this user.
    expect(emitLearningSignal).toHaveBeenCalledWith("user-uuid-1");

    // Toast within the 5s budget.
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
    expect(answerCallbackQuery.mock.calls[0]![0]).toBe("cb-tn-1");
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toBe(
      REPLY_CAPTURE_COPY.toastSaved
    );

    // Confirm message edited into its resolved form (keyboard cleared).
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(editMessageText.mock.calls[0]!.slice(0, 3)).toEqual([
      12345,
      600,
      '💾 Saved: "more shipping-lane news"',
    ]);
  });

  it("toasts the unlinked message and writes nothing when the chat has no user", async () => {
    selectResults = [[]];
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(tnCallback("yes", buildConfirmText("anything")));

    expect(insertCall).not.toHaveBeenCalled();
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toBe(
      REPLY_CAPTURE_COPY.toastUnlinked
    );
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("toasts expired and writes nothing when the confirm text is missing/unparseable", async () => {
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(tnCallback("yes", undefined));

    expect(insertCall).not.toHaveBeenCalled();
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toBe(
      REPLY_CAPTURE_COPY.toastExpired
    );
  });
});

describe("dispatchTelegramUpdate — tn:no (Ignore)", () => {
  it("writes nothing, toasts Ignored., and clears the confirm message", async () => {
    const { dispatchTelegramUpdate } = await import(
      "@/server/channels/telegram/inbound/dispatch"
    );

    await dispatchTelegramUpdate(
      tnCallback("no", buildConfirmText("more shipping-lane news"))
    );

    expect(insertCall).not.toHaveBeenCalled();
    expect(emitLearningSignal).not.toHaveBeenCalled();
    expect(answerCallbackQuery.mock.calls[0]![1]?.text).toBe(
      REPLY_CAPTURE_COPY.toastIgnored
    );
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(editMessageText.mock.calls[0]!.slice(0, 3)).toEqual([
      12345,
      600,
      "Not saved.",
    ]);
  });
});
