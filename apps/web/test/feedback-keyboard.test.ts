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
} from "@/server/channels/telegram/keyboard";

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

// Mocked db: we capture every insert payload (tagged with its target
// table) and let the test control whether onConflictDoNothing returns a
// row (insert ok) or nothing (dup). CAD-211: a recorded vote now writes
// TWO rows — feedback_events, then a learning_log fingerprint — so the
// insert mock supports both the onConflictDoNothing chain and a plain
// awaited `.values()`.
const insertedRows: Array<{ table: unknown; values: Record<string, unknown> }> = [];
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
              return Promise.resolve([
                {
                  id: "run-1",
                  specId: "spec-1",
                  runDate: "2026-06-11",
                  composedMarkdown:
                    "# Daily brief\n\n## Prices\nCPO up.\n\n## What moved\nMPOB stocks.\n\n## Watchlist\nnothing.",
                },
              ]);
            }
            if (activeTable === schema.digestSpecs) {
              return Promise.resolve([
                { spec: { topics: ["CPO", "MPOB", "palm oil exports", "ringgit"] } },
              ]);
            }
            return Promise.resolve([]);
          },
        };
        return chain;
      },
      insert(table: unknown) {
        return {
          values(v: Record<string, unknown>) {
            insertedRows.push({ table, values: v });
            return {
              onConflictDoNothing() {
                return {
                  returning: () => Promise.resolve(nextInsertReturning),
                };
              },
              // Plain awaited insert (learning_log path).
              then(resolve: (v: unknown) => unknown) {
                return Promise.resolve(undefined).then(resolve);
              },
            };
          },
        };
      },
    },
  };
});

import { recordFeedbackCallback } from "@/server/channels/telegram/inbound/feedback-callback";
import { db } from "@/server/db/client";
import { learningLog, feedbackEvents as feedbackEventsTable } from "@/server/db/schema";

void db; // imported to make the mock graph explicit

function insertsInto(table: unknown) {
  return insertedRows.filter((r) => r.table === table);
}

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
    const fbInserts = insertsInto(feedbackEventsTable);
    expect(fbInserts).toHaveLength(1);
    expect(fbInserts[0]!.values).toMatchObject({
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
// 2b. CAD-211 — recorded votes mirror a fingerprint into learning_log
// ===========================================================================
describe("recordFeedbackCallback — learning_log fingerprint (CAD-211)", () => {
  const RUN_ID = "2f4c5a6e-1234-4567-89ab-cdef01234567";
  const baseInput = {
    callbackId: "cb-lll",
    telegramUserId: 9999,
    telegramChatId: 12345,
    runId: RUN_ID,
  } as const;

  it("a recorded 👍 inserts source=feedback_event with the fingerprint shape", async () => {
    const result = await recordFeedbackCallback({ ...baseInput, vote: "up" });
    expect(result).toEqual({ kind: "recorded" });

    const llInserts = insertsInto(learningLog);
    expect(llInserts).toHaveLength(1);
    expect(llInserts[0]!.values).toMatchObject({
      userId: "user-1",
      source: "feedback_event",
    });

    const rawText = llInserts[0]!.values.rawText as string;
    // Vote label + run date + sections (markdown headings) + topics.
    expect(rawText).toBe(
      "👍 (more like this) on brief 2026-06-11 — sections: Daily brief, Prices, What moved; about: CPO, MPOB, palm oil exports"
    );
    expect(rawText.length).toBeLessThanOrEqual(200);
  });

  it("all four votes write, with the matching label", async () => {
    const expectations: Array<[string, RegExp]> = [
      ["up", /^👍 \(more like this\) on brief 2026-06-11/],
      ["down", /^👎 \(less like this\) on brief 2026-06-11/],
      ["love", /^🔥 \(loved it\) on brief 2026-06-11/],
      ["skip", /^💤 \(skip topic\) on brief 2026-06-11/],
    ];
    for (const [vote, re] of expectations) {
      insertedRows.length = 0;
      await recordFeedbackCallback({
        ...baseInput,
        callbackId: `cb-${vote}`,
        vote: vote as "up" | "down" | "love" | "skip",
      });
      const llInserts = insertsInto(learningLog);
      expect(llInserts).toHaveLength(1);
      expect(llInserts[0]!.values.rawText as string).toMatch(re);
    }
  });

  it("a duplicate vote does NOT double-write learning_log", async () => {
    nextInsertReturning = []; // ON CONFLICT DO NOTHING -> duplicate

    const result = await recordFeedbackCallback({ ...baseInput, vote: "love" });
    expect(result).toEqual({ kind: "duplicate" });
    expect(insertsInto(learningLog)).toHaveLength(0);
  });
});

// ===========================================================================
// 2c. CAD-211 — fingerprint builders are pure and bounded
// ===========================================================================
import {
  buildBriefFingerprint,
  extractSectionHeadings,
  FINGERPRINT_MAX_CHARS,
} from "@/server/channels/telegram/inbound/feedback-callback";

describe("buildBriefFingerprint / extractSectionHeadings", () => {
  it("extracts up to 3 headings, stripping markdown decoration", () => {
    const md = "# *Daily* brief\nbody\n## Prices\n## What moved\n## Watchlist\n## Extra";
    expect(extractSectionHeadings(md)).toEqual(["Daily brief", "Prices", "What moved"]);
    expect(extractSectionHeadings(null)).toEqual([]);
    expect(extractSectionHeadings("no headings here")).toEqual([]);
  });

  it("reads the real renderer's whole-line bold headings, skipping header + boilerplate", () => {
    // Mirrors server/ai/composer/render.ts output shape.
    const md = [
      "🌾 *Cadence* · Daily · 2026-06-11",
      "",
      "*TL;DR* — CPO futures slid 2%.",
      "",
      "*Prices*",
      "- CPO Aug: RM 3,900",
      "",
      "*What moved*",
      "- MPOB stocks report",
      "",
      "*Why this matters to you*",
      "blah",
      "",
      "*Sources*",
      "1. example.com",
    ].join("\n");
    expect(extractSectionHeadings(md)).toEqual(["Prices", "What moved"]);
  });

  it("omits empty sections/topics segments cleanly", () => {
    expect(
      buildBriefFingerprint({ vote: "down", runDate: "2026-06-11", sections: [], topics: [] })
    ).toBe("👎 (less like this) on brief 2026-06-11");
    expect(
      buildBriefFingerprint({ vote: "skip", runDate: "2026-06-11", sections: [], topics: ["crypto"] })
    ).toBe("💤 (skip topic) on brief 2026-06-11 — about: crypto");
  });

  it("hard-caps rawText at 200 chars even with pathological inputs", () => {
    const fp = buildBriefFingerprint({
      vote: "up",
      runDate: "2026-06-11",
      sections: ["s".repeat(40), "t".repeat(40), "u".repeat(40)],
      topics: ["x".repeat(120), "y".repeat(120), "z".repeat(120)],
    });
    expect(fp.length).toBeLessThanOrEqual(FINGERPRINT_MAX_CHARS);
    expect(fp.endsWith("…")).toBe(true);
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
      COMPOSER_MODEL_ID: "test-model",
    }));
    vi.doMock("@/server/channels/telegram/client", async () => {
      // Use the real safeSendTelegramMessage so the fallback path is also
      // exercised here. The mock only swaps out the bot + config check.
      const actual = await vi.importActual<typeof import("@/server/channels/telegram/client")>(
        "@/server/channels/telegram/client"
      );
      return {
        ...actual,
        isTelegramConfigured: () => true,
        getBot: () => ({ api: { sendMessage } }),
      };
    });
    vi.doMock("@/server/channels/telegram/format", async () => {
      // Spread the actual module — the channel adapter (CAD-207) also
      // imports the caps + splitter; only formatComposerOutput is swapped.
      const actual = await vi.importActual<typeof import("@/server/channels/telegram/format")>(
        "@/server/channels/telegram/format"
      );
      return {
        ...actual,
        formatComposerOutput: () =>
          opts.parts.map((text) => ({ text, parseMode: "Markdown" })),
      };
    });
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
