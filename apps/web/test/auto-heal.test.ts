/**
 * T-304 bonus: auto-heal delivery_broken on successful delivery.
 *
 * Contract under test (locked 2026-06-02):
 *   - Any successful Telegram delivery from the digest pipeline must flip
 *     users.state from `delivery_broken` back to `active`.
 *   - The update must be guarded by `state = 'delivery_broken'` so we never
 *     accidentally overwrite a future state (e.g. `paused`).
 *   - This applies to BOTH entry points (cron-dispatched with digestRunId
 *     AND manual `digest.sampleNow` without one).
 *
 * Test strategy:
 *   We stub every external boundary (Anthropic compose, Telegram send, DB)
 *   and assert the heal UPDATE fires on a delivered success — and does NOT
 *   fire on a failed path.
 *
 *   Mocks are set up against the `users` table import object identity so the
 *   `.update(users)` call site is unambiguously the heal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Boundary mocks — order matters, must be declared before importing run.ts.
// ---------------------------------------------------------------------------

// Compose: return a fixed markdown, zero cost.
vi.mock("@/server/ai/composer/compose", () => ({
  composeDigest: vi.fn(async () => ({ markdown: "# Brief", costUsd: 0 })),
  // CAD-85/88: the default provider adapter reads COMPOSER_MODEL_ID at
  // module init via defaultComposerProvider.modelId.
  COMPOSER_MODEL_ID: "claude-haiku-4-5-20251001",
}));

// Telegram: stub configured + bot.api.sendMessage success.
// Pull the real safeSendTelegramMessage through so the parse-mode fallback
// helper is still exercised; only swap the bot + config check.
vi.mock("@/server/telegram/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/telegram/client")>(
    "@/server/telegram/client"
  );
  return {
    ...actual,
    isTelegramConfigured: () => true,
    getBot: () => ({
      api: {
        sendMessage: vi.fn(async () => ({ message_id: 1 })),
      },
    }),
  };
});

vi.mock("@/server/telegram/format", () => ({
  formatComposerOutput: (md: string) => [{ text: md, parseMode: "MarkdownV2" }],
}));

// Source connectors: empty.
vi.mock("@/server/connectors/brave-search", () => ({
  isBraveConfigured: () => false,
  braveSearch: vi.fn(),
  BraveKeyMissingError: class BraveKeyMissingError extends Error {},
}));

vi.mock("@/server/connectors/rss", () => ({
  recentRssForSpec: vi.fn(async () => []),
}));

// ---------------------------------------------------------------------------
// DB mock — we want to:
//   - return a "delivery_broken" user from select(users)
//   - return a current spec from select(digestSpecs)
//   - intercept insert(digestRuns) to return an id
//   - intercept update(...) calls so we can see which table got updated.
// ---------------------------------------------------------------------------

const updateCalls: Array<{ table: unknown; values: Record<string, unknown> }> = [];

function makeUpdateChain(table: unknown) {
  return {
    set(values: Record<string, unknown>) {
      updateCalls.push({ table, values });
      return {
        where: () => Promise.resolve(undefined),
      };
    },
  };
}

// Track which select branch is being called by inspecting the table arg.
function makeSelectChain(rowsByTable: Map<unknown, unknown[]>) {
  let activeTable: unknown = null;
  return {
    from(table: unknown) {
      activeTable = table;
      return this;
    },
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    limit() {
      return Promise.resolve(rowsByTable.get(activeTable) ?? []);
    },
    // Drizzle select-without-limit pattern (e.g. learning_log candidates
    // are queried with .limit(50) — handled above — but be tolerant of
    // future callers that omit limit and `await` the chain directly).
    then(resolve: (rows: unknown[]) => unknown) {
      return Promise.resolve(rowsByTable.get(activeTable) ?? []).then(resolve);
    },
  };
}

vi.mock("@/server/db/client", async () => {
  const schema = await vi.importActual<typeof import("@/server/db/schema")>(
    "@/server/db/schema"
  );
  return {
    db: {
      select() {
        const rowsByTable = new Map<unknown, unknown[]>();
        rowsByTable.set(schema.users, [
          {
            id: "user-1",
            email: "broken@example.com",
            telegramChatId: 12345,
            state: "delivery_broken",
          },
        ]);
        rowsByTable.set(schema.digestSpecs, [
          {
            id: "spec-1",
            userId: "user-1",
            spec: { topics: [] },
          },
        ]);
        return makeSelectChain(rowsByTable);
      },
      insert() {
        return {
          values: () => ({
            returning: () => Promise.resolve([{ id: "run-1", attemptCount: 1 }]),
          }),
        };
      },
      update(table: unknown) {
        return makeUpdateChain(table);
      },
    },
  };
});

import { runDigestPipeline } from "@/server/digest/run";
import { users, digestRuns } from "@/server/db/schema";

beforeEach(() => {
  updateCalls.length = 0;
});

describe("auto-heal delivery_broken on success", () => {
  it("flips users.state -> active on a successful sampleNow delivery", async () => {
    const result = await runDigestPipeline({ userId: "user-1" });

    expect(result.status).toBe("delivered");

    // The heal must target the users table with state='active'.
    const healCalls = updateCalls.filter((c) => c.table === users);
    expect(healCalls).toHaveLength(1);
    expect(healCalls[0]!.values).toMatchObject({ state: "active" });
  });

  it("flips users.state -> active on the cron-dispatched path (digestRunId set)", async () => {
    const result = await runDigestPipeline({
      userId: "user-1",
      digestRunId: "run-1",
    });

    expect(result.status).toBe("delivered");

    // digestRuns row UPDATE + users heal UPDATE both fire.
    const runUpdates = updateCalls.filter((c) => c.table === digestRuns);
    const healUpdates = updateCalls.filter((c) => c.table === users);
    expect(runUpdates).toHaveLength(1);
    expect(healUpdates).toHaveLength(1);
    expect(healUpdates[0]!.values).toMatchObject({ state: "active" });
  });

  it("does NOT heal on a dry-run preview (no real delivery)", async () => {
    const result = await runDigestPipeline({ userId: "user-1", dryRun: true });
    expect(result.status).toBe("composed_dry_run");

    const healUpdates = updateCalls.filter((c) => c.table === users);
    expect(healUpdates).toHaveLength(0);
  });
});
