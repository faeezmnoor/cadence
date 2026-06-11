/**
 * CAD-214 (P0-3) — spec hydration from the claimed run.
 *
 * Contract: the dispatcher claims digest_runs rows PER SPEC. The pipeline
 * must compose THAT spec — never "the current" one — or a multi-brief user
 * receives content from the wrong brief. Resolution order:
 *
 *   1. claimed run's spec_id        (digestRunId param)
 *   2. explicit params.specId       (per-brief sample/manual)
 *   3. legacy is_current fallback   (single-brief manual paths)
 *
 * Strategy: table-identity db mock (same harness as auto-heal.test.ts) with
 * a where-clause capture. Drizzle SQL objects embed bound params, so a
 * circular-safe stringify of the digestSpecs where-arg tells us which spec
 * the pipeline asked for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/ai/composer/compose", () => ({
  composeDigest: vi.fn(async () => ({ markdown: "# Brief", costUsd: 0 })),
  COMPOSER_MODEL_ID: "claude-haiku-4-5-20251001",
}));

vi.mock("@/server/channels/telegram/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/channels/telegram/client")>(
    "@/server/channels/telegram/client"
  );
  return {
    ...actual,
    isTelegramConfigured: () => true,
    getBot: () => ({
      api: { sendMessage: vi.fn(async () => ({ message_id: 1 })) },
    }),
  };
});

vi.mock("@/server/channels/telegram/format", async () => {
  const actual = await vi.importActual<typeof import("@/server/channels/telegram/format")>(
    "@/server/channels/telegram/format"
  );
  return {
    ...actual,
    formatComposerOutput: (md: string) => [{ text: md, parseMode: "Markdown" }],
  };
});

vi.mock("@/server/connectors/brave-search", () => ({
  isBraveConfigured: () => false,
  braveSearch: vi.fn(),
  BraveKeyMissingError: class BraveKeyMissingError extends Error {},
}));

vi.mock("@/server/connectors/rss", () => ({
  recentRssForSpec: vi.fn(async () => []),
}));

// ---------------------------------------------------------------------------
// DB mock with per-table where-capture.
// ---------------------------------------------------------------------------

/** Circular-safe stringify so we can grep bound params out of drizzle SQL. */
function sqlToString(arg: unknown): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(arg, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[circular]";
        seen.add(v);
      }
      return v;
    });
  } catch {
    return String(arg);
  }
}

const specWhereCaptures: string[] = [];
const rowsByTableFactory: {
  current: () => Map<unknown, unknown[]>;
} = { current: () => new Map() };

vi.mock("@/server/db/client", async () => {
  const schema = await vi.importActual<typeof import("@/server/db/schema")>(
    "@/server/db/schema"
  );
  function makeSelectChain() {
    const rowsByTable = rowsByTableFactory.current();
    let activeTable: unknown = null;
    const chain = {
      from(table: unknown) {
        activeTable = table;
        return chain;
      },
      where(arg: unknown) {
        if (activeTable === schema.digestSpecs) {
          specWhereCaptures.push(sqlToString(arg));
        }
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return Promise.resolve(rowsByTable.get(activeTable) ?? []);
      },
      then(resolve: (rows: unknown[]) => unknown) {
        return Promise.resolve(rowsByTable.get(activeTable) ?? []).then(resolve);
      },
    };
    return chain;
  }
  return {
    db: {
      select() {
        return makeSelectChain();
      },
      insert() {
        return {
          values: () => ({
            returning: () => Promise.resolve([{ id: "run-new", attemptCount: 1 }]),
          }),
        };
      },
      update() {
        return {
          set: () => ({ where: () => Promise.resolve(undefined) }),
        };
      },
    },
  };
});

import { runDigestPipeline } from "@/server/digest/run";
import * as schema from "@/server/db/schema";

function baseRows(): Map<unknown, unknown[]> {
  const m = new Map<unknown, unknown[]>();
  m.set(schema.users, [
    {
      id: "user-1",
      email: "u@example.com",
      telegramChatId: 12345,
      state: "active",
      creditsBalance: 10,
      distilledPrefs: null,
    },
  ]);
  m.set(schema.digestSpecs, [
    { id: "spec-resolved", userId: "user-1", status: "active", spec: { topics: [] } },
  ]);
  m.set(schema.learningLog, []);
  return m;
}

beforeEach(() => {
  specWhereCaptures.length = 0;
});

describe("CAD-214 — spec resolution order", () => {
  it("hydrates the spec from the claimed run's spec_id when digestRunId is passed", async () => {
    const rows = baseRows();
    rows.set(schema.digestRuns, [{ specId: "spec-CLAIMED" }]);
    rowsByTableFactory.current = () => rows;

    const result = await runDigestPipeline({
      userId: "user-1",
      digestRunId: "run-claimed",
      dryRun: true,
    });

    expect(result.status).toBe("composed_dry_run");
    expect(specWhereCaptures.length).toBeGreaterThan(0);
    expect(specWhereCaptures[0]).toContain("spec-CLAIMED");
  });

  it("uses explicit params.specId on manual paths with no claimed run", async () => {
    const rows = baseRows();
    rows.set(schema.digestRuns, []);
    rowsByTableFactory.current = () => rows;

    const result = await runDigestPipeline({
      userId: "user-1",
      specId: "spec-EXPLICIT",
      dryRun: true,
    });

    expect(result.status).toBe("composed_dry_run");
    expect(specWhereCaptures[0]).toContain("spec-EXPLICIT");
  });

  it("falls back to is_current resolution when neither id is provided", async () => {
    const rows = baseRows();
    rows.set(schema.digestRuns, []);
    rowsByTableFactory.current = () => rows;

    const result = await runDigestPipeline({ userId: "user-1", dryRun: true });

    expect(result.status).toBe("composed_dry_run");
    expect(specWhereCaptures[0]).not.toContain("spec-CLAIMED");
    expect(specWhereCaptures[0]).not.toContain("spec-EXPLICIT");
    // The fallback filters on is_current — the bound param true plus the
    // column name should both appear in the captured clause.
    expect(specWhereCaptures[0]).toContain("is_current");
  });

  it("claimed run's spec wins over explicit params.specId", async () => {
    const rows = baseRows();
    rows.set(schema.digestRuns, [{ specId: "spec-CLAIMED" }]);
    rowsByTableFactory.current = () => rows;

    await runDigestPipeline({
      userId: "user-1",
      digestRunId: "run-claimed",
      specId: "spec-EXPLICIT",
      dryRun: true,
    });

    expect(specWhereCaptures[0]).toContain("spec-CLAIMED");
    expect(specWhereCaptures[0]).not.toContain("spec-EXPLICIT");
  });
});
