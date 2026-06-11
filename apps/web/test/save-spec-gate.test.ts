/**
 * CAD-212 — chat-save brief-count gate in saveSpecForUser.
 *
 * Joint ruling 2026-06-11: partners are capped at 1 non-archived brief;
 * the founder account (admin email allowlist) is exempt at 2. A save that
 * would have created a second brief becomes an UPDATE of the existing
 * one (archive-then-replace, the legacy versioning flow) and returns a
 * `notice` the chat surfaces — no silent data loss.
 *
 * Mocked at the module boundary (@/server/db/client) per repo pattern:
 * the tx mock routes selects by table + selected columns, records update
 * payloads, and echoes inserts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";
import { SINGLE_BRIEF_NOTICE } from "@/server/briefs/limit";

interface UpdateCall {
  table: unknown;
  set: Record<string, unknown>;
}
interface InsertCall {
  table: unknown;
  values: Record<string, unknown>;
}

let userEmail = "partner@example.com";
let nonArchivedSpecIds: string[] = [];
let latestVersion = 0;
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

vi.mock("@/server/db/client", async () => {
  const schema =
    await vi.importActual<typeof import("@/server/db/schema")>("@/server/db/schema");

  function makeTx() {
    return {
      select(cols: Record<string, unknown>) {
        const colKeys = Object.keys(cols);
        let activeTable: unknown = null;
        const resolveRows = (): unknown[] => {
          if (activeTable === schema.users) {
            return [{ timezone: "Asia/Kuala_Lumpur", email: userEmail }];
          }
          if (activeTable === schema.digestSpecs) {
            // The gate's existing-briefs probe selects {id}; the version
            // bump selects {version}.
            if (colKeys.includes("version")) {
              return [{ version: latestVersion }];
            }
            return nonArchivedSpecIds.map((id) => ({ id }));
          }
          return [];
        };
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
            return Promise.resolve(resolveRows());
          },
          then(resolve: (v: unknown[]) => unknown) {
            return Promise.resolve(resolveRows()).then(resolve);
          },
        };
        return chain;
      },
      update(table: unknown) {
        const chain = {
          set(p: Record<string, unknown>) {
            updateCalls.push({ table, set: p });
            return chain;
          },
          where() {
            return chain;
          },
          then(resolve: (v: unknown) => unknown) {
            return Promise.resolve(undefined).then(resolve);
          },
        };
        return chain;
      },
      insert(table: unknown) {
        return {
          values(v: Record<string, unknown>) {
            insertCalls.push({ table, values: v });
            return {
              returning: () =>
                Promise.resolve([{ id: "spec-new", version: v.version }]),
            };
          },
        };
      },
    };
  }

  return {
    db: {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
    },
  };
});

import { saveSpecForUser } from "@/server/ai/config-agent/save-spec";
import { digestSpecs } from "@/server/db/schema";

const USER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  userEmail = "partner@example.com";
  nonArchivedSpecIds = [];
  latestVersion = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  vi.unstubAllEnvs();
});

describe("saveSpecForUser — CAD-212 brief-count gate", () => {
  it("first brief (0 non-archived): plain insert, no archive, no notice", async () => {
    const result = await saveSpecForUser({ userId: USER_ID, spec: emptyDigestSpec() });

    expect(result.id).toBe("spec-new");
    expect(result.version).toBe(1);
    expect(result.notice).toBeUndefined();
    // No other brief gets touched.
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.table).toBe(digestSpecs);
    expect(insertCalls[0]!.values).toMatchObject({
      userId: USER_ID,
      isCurrent: true,
      status: "active",
    });
  });

  it("partner at the cap (1 brief): save becomes an update — archive-then-replace + notice", async () => {
    nonArchivedSpecIds = ["existing-1"];
    latestVersion = 3;

    const result = await saveSpecForUser({ userId: USER_ID, spec: emptyDigestSpec() });

    expect(result.version).toBe(4);
    expect(result.notice).toBe(SINGLE_BRIEF_NOTICE);
    // Exactly one update: the legacy archive-then-replace of the current row.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.set).toMatchObject({
      isCurrent: false,
      status: "archived",
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]!.values).toMatchObject({ isCurrent: true, status: "active" });
  });

  it("founder under the cap: creates a second brief WITHOUT archiving the first", async () => {
    vi.stubEnv("CADENCE_ADMIN_EMAILS", "founder@cadence.news");
    userEmail = "founder@cadence.news";
    nonArchivedSpecIds = ["existing-1"];
    latestVersion = 7;

    const result = await saveSpecForUser({ userId: USER_ID, spec: emptyDigestSpec() });

    expect(result.version).toBe(8);
    expect(result.notice).toBeUndefined();
    // is_current hands over, but the existing brief is NOT archived —
    // it keeps status + next_run_at and continues to dispatch by spec_id.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.set).toMatchObject({ isCurrent: false });
    expect(updateCalls[0]!.set).not.toHaveProperty("status");
    expect(insertCalls).toHaveLength(1);
  });

  it("founder at the cap (2 briefs): falls back to the update path with notice", async () => {
    vi.stubEnv("CADENCE_ADMIN_EMAILS", "founder@cadence.news");
    userEmail = "founder@cadence.news";
    nonArchivedSpecIds = ["existing-1", "existing-2"];
    latestVersion = 9;

    const result = await saveSpecForUser({ userId: USER_ID, spec: emptyDigestSpec() });

    expect(result.notice).toBe(SINGLE_BRIEF_NOTICE);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.set).toMatchObject({
      isCurrent: false,
      status: "archived",
    });
  });
});
