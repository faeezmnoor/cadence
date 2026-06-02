/**
 * Phase 4 / T-401 + T-402 (CAD-42, CAD-43): inline-keyboard payload and
 * callback handler contract.
 *
 * Three concern blocks:
 *
 *   1. keyboard.ts — pure encoding. callback_data within 64-byte Telegram
 *      cap, round-trips through parseCallbackData, rejects garbage.
 *
 *   2. recordFeedbackCallback — DB writes through a mocked driver. Records
 *      an inline_keyboard row, dedupes on telegram_callback_id (the
 *      partial UNIQUE index from migration 0006), and never logs a vote
 *      against a foreign user's digest_run.
 *
 *   3. delivery pipeline integration — runDigestPipeline attaches the
 *      reply_markup only to the FINAL part, and only when
 *      keyboard_enabled AND a digestRunId is in hand.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildFeedbackKeyboard,
  parseCallbackData,
  encodeCallbackData,
  FEEDBACK_VOTES,
} from "@/server/telegram/keyboard";

// ===========================================================================
// 1. keyboard.ts — encoding contract
// ===========================================================================
describe("inline-keyboard callback_data encoding", () => {
  const SAMPLE_RUN_ID = "2f4c5a6e-1234-4567-89ab-cdef01234567";

  it("renders 4 buttons in a 2x2 grid with fb:<vote>:<run_id> callback_data", () => {
    const kb = buildFeedbackKeyboard(SAMPLE_RUN_ID);
    expect(kb.inline_keyboard).toHaveLength(2);
    expect(kb.inline_keyboard[0]).toHaveLength(2);
    expect(kb.inline_keyboard[1]).toHaveLength(2);

    const flat = kb.inline_keyboard.flat();
    expect(flat).toHaveLength(4);

    const votes = flat.map((b) => b.callback_data.split(":")[1]);
    expect(new Set(votes)).toEqual(new Set(FEEDBACK_VOTES));

    for (const btn of flat) {
      expect(btn.callback_data.startsWith("fb:")).toBe(true);
      expect(btn.callback_data.endsWith(SAMPLE_RUN_ID)).toBe(true);
    }
  });

  it("encoded callback_data always fits Telegram's 64-byte cap", () => {
    for (const vote of FEEDBACK_VOTES) {
      const data = encodeCallbackData(vote, SAMPLE_RUN_ID);
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    }
  });

  it("parseCallbackData round-trips encoded payloads", () => {
    for (const vote of FEEDBACK_VOTES) {
      const parsed = parseCallbackData(encodeCallbackData(vote, SAMPLE_RUN_ID));
      expect(parsed).toEqual({ vote, runId: SAMPLE_RUN_ID });
    }
  });

  it("rejects garbage callback_data", () => {
    expect(parseCallbackData(null)).toBeNull();
    expect(parseCallbackData("")).toBeNull();
    expect(parseCallbackData("hello")).toBeNull();
    expect(parseCallbackData("fb:invalid:" + SAMPLE_RUN_ID)).toBeNull();
    expect(parseCallbackData("fb:up:not-a-uuid")).toBeNull();
    expect(parseCallbackData("xx:up:" + SAMPLE_RUN_ID)).toBeNull();
  });
});

// ===========================================================================
// 2. recordFeedbackCallback — DB write + dedupe
// ===========================================================================

// Mocked db: we capture the last insert payload and let the test
// control whether onConflictDoNothing returns a row (insert ok) or
// nothing (dup).
const insertedRows: Array<Record<string, unknown>> = [];
let nextInsertReturning: Array<{ id: string }> = [];

vi.mock("@/server/db/client", async () => {
  const schema =
    await vi.importActual<typeof import("@/server/db/schema")>("@/server/db/schema");
  return {
    db: {
      select() {
        let activeTable: unknown = null;
        const chain = {
          from(t: unknown) {
            activeTable = t;
            return chain;
          },
          where() {
            return chain;
          },
          limit() {
            if (activeTable === schema.users) {
              return Promise.resolve([{ id: "user-1" }]);
            }
            if (activeTable === schema.digestRuns) {
              return Promise.resolve([{ id: "run-1" }]);
            }
            return Promise.resolve([]);
          },
        };
        return chain;
      },
      insert(_table: unknown) {
        return {
          values(v: Record<string, unknown>) {
            insertedRows.push(v);
            return {
              onConflictDoNothing() {
                return {
                  returning: () => Promise.resolve(nextInsertReturning),
                };
              },
            };
          },
        };
      },
    },
  };
});

import { recordFeedbackCallback } from "@/server/telegram/feedback-callback";

beforeEach(() => {
  insertedRows.length = 0;
  nextInsertReturning = [{ id: "fb-1" }]; // default: insert succeeds
});

describe("recordFeedbackCallback — feedback_events writes", () => {
  it("records an inline_keyboard row when callback maps to a known user + run", async () => {
    const result = await recordFeedbackCallback({
      callbackId: "cb-aaaa",
      telegramUserId: 9999,
      telegramChatId: 12345,
      runId: "2f4c5a6e-1234-4567-89ab-cdef01234567",
      vote: "up",
    });

    expect(result).toEqual({ kind: "recorded" });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      userId: "user-1",
      digestRunId: "2f4c5a6e-1234-4567-89ab-cdef01234567",
      vote: "up",
      signalType: "thumbs_up",
      telegramCallbackId: "cb-aaaa",
      source: "inline_keyboard",
    });
  });

  it("returns duplicate when telegram_callback_id collides (UNIQUE dedupe)", async () => {
    // Simulate ON CONFLICT DO NOTHING -> empty returning.
    nextInsertReturning = [];

    const result = await recordFeedbackCallback({
      callbackId: "cb-aaaa",
      telegramUserId: 9999,
      telegramChatId: 12345,
      runId: "2f4c5a6e-1234-4567-89ab-cdef01234567",
      vote: "down",
    });

    expect(result).toEqual({ kind: "duplicate" });
  });
});

// ===========================================================================
// 3. Delivery pipeline integration — keyboard attaches to final part only
// ===========================================================================
//
// We use a SEPARATE vi.mock graph via vi.resetModules + dynamic import so
// the pipeline test doesn't fight the recordFeedbackCallback mocks.

describe("runDigestPipeline — inline-keyboard attachment", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadPipeline(opts: {
    keyboardEnabled: boolean;
    parts: string[];
  }) {
    const sendMessage = vi.fn<(...args: any[]) => Promise<{ message_id: number }>>(
      async () => ({ message_id: 1 })
    );

    vi.doMock("@/server/ai/composer/compose", () => ({
      composeDigest: vi.fn(async () => ({ markdown: "# Brief", costUsd: 0 })),
    }));
    vi.doMock("@/server/telegram/client", () => ({
      isTelegramConfigured: () => true,
      getBot: () => ({ api: { sendMessage } }),
    }));
    vi.doMock("@/server/telegram/format", () => ({
      formatComposerOutput: () =>
        opts.parts.map((text) => ({ text, parseMode: "Markdown" })),
    }));
    vi.doMock("@/server/connectors/brave-search", () => ({
      isBraveConfigured: () => false,
      braveSearch: vi.fn(),
      BraveKeyMissingError: class BraveKeyMissingError extends Error {},
    }));
    vi.doMock("@/server/connectors/rss", () => ({
      recentRssForSpec: vi.fn(async () => []),
    }));

    vi.doMock("@/server/db/client", async () => {
      const schema =
        await vi.importActual<typeof import("@/server/db/schema")>(
          "@/server/db/schema"
        );
      return {
        db: {
          select() {
            let activeTable: unknown = null;
            const chain = {
              from(t: unknown) {
                activeTable = t;
                return chain;
              },
              where() {
                return chain;
              },
              orderBy() {
                return chain;
              },
              limit() {
                if (activeTable === schema.users) {
                  return Promise.resolve([
                    {
                      id: "user-1",
                      telegramChatId: 12345,
                      state: "active",
                      distilledPrefs: null,
                    },
                  ]);
                }
                if (activeTable === schema.digestSpecs) {
                  return Promise.resolve([
                    {
                      id: "spec-1",
                      userId: "user-1",
                      spec: { topics: [] },
                      keyboardEnabled: opts.keyboardEnabled,
                    },
                  ]);
                }
                if (activeTable === schema.learningLog) {
                  return Promise.resolve([]);
                }
                return Promise.resolve([]);
              },
            };
            return chain;
          },
          insert() {
            return {
              values: () => ({
                returning: () => Promise.resolve([{ id: "run-1", attemptCount: 1 }]),
              }),
            };
          },
          update() {
            return { set: () => ({ where: () => Promise.resolve(undefined) }) };
          },
        },
      };
    });

    const mod = await import("@/server/digest/run");
    return { runDigestPipeline: mod.runDigestPipeline, sendMessage };
  }

  it("attaches reply_markup ONLY to the final part when keyboard_enabled + digestRunId", async () => {
    const { runDigestPipeline, sendMessage } = await loadPipeline({
      keyboardEnabled: true,
      parts: ["part 1", "part 2", "part 3"],
    });

    const result = await runDigestPipeline({
      userId: "user-1",
      digestRunId: "2f4c5a6e-1234-4567-89ab-cdef01234567",
    });
    expect(result.status).toBe("delivered");
    expect(sendMessage).toHaveBeenCalledTimes(3);

    // First two: no reply_markup.
    expect(sendMessage.mock.calls[0]![2]).not.toHaveProperty("reply_markup");
    expect(sendMessage.mock.calls[1]![2]).not.toHaveProperty("reply_markup");
    // Final: reply_markup present + carries the digestRunId in callback_data.
    const finalOpts = sendMessage.mock.calls[2]![2] as {
      reply_markup?: { inline_keyboard: Array<Array<{ callback_data: string }>> };
    };
    expect(finalOpts.reply_markup).toBeDefined();
    const allData = finalOpts.reply_markup!.inline_keyboard
      .flat()
      .map((b) => b.callback_data);
    expect(
      allData.every((d) => d.endsWith("2f4c5a6e-1234-4567-89ab-cdef01234567"))
    ).toBe(true);
  });

  it("omits reply_markup when spec.keyboard_enabled is false", async () => {
    const { runDigestPipeline, sendMessage } = await loadPipeline({
      keyboardEnabled: false,
      parts: ["only part"],
    });

    await runDigestPipeline({
      userId: "user-1",
      digestRunId: "2f4c5a6e-1234-4567-89ab-cdef01234567",
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![2]).not.toHaveProperty("reply_markup");
  });

  it("omits reply_markup on manual sampleNow path (no digestRunId)", async () => {
    const { runDigestPipeline, sendMessage } = await loadPipeline({
      keyboardEnabled: true,
      parts: ["only part"],
    });

    await runDigestPipeline({ userId: "user-1" });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![2]).not.toHaveProperty("reply_markup");
  });
});
