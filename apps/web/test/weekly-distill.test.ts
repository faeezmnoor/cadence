/**
 * T-405 (CAD-46) unit coverage for the weekly distill function.
 *
 * Covers:
 *   - parseDistillOutput tolerance (bare array, code fence, trailing prose)
 *   - distillUser: empty-user fast path → no LLM call, no writes, no
 *     distilled_at stamps
 *   - distillUser: happy path → writes new bullets, stamps every consumed row
 *   - distillUser: unknown user → skipped with reason
 *
 * We drive the exported pure / single-helper functions directly with
 * fakes — no real DB, no Inngest, no LLM. The Inngest wiring is trivial.
 */
import { describe, it, expect, vi } from "vitest";
import {
  distillUser,
  type WeeklyDistillPerUserResult,
} from "@/server/inngest/functions/weekly-distill";
import { parseDistillOutput } from "@/server/ai/distill/prompt";

interface FakeUserRow {
  id: string;
  distilledPrefs: unknown;
}

interface FakeRawRow {
  id: string;
  rawText: string;
  createdAt: Date;
}

interface UpdateRecord {
  table: "users" | "learningLog";
  set: Record<string, unknown>;
  whereId: string;
}

/**
 * Build a fake drizzle-like DB. Order of select() calls in distillUser:
 *   1) users (one row by id, .limit(1))
 *   2) learningLog (rows by userId + distilled_at IS NULL, .orderBy, .limit)
 *
 * Order of update() calls:
 *   1) users (set distilledPrefs)
 *   2..N) learningLog (set distilled_at) — one per consumed row
 */
function buildFakeDb(userRow: FakeUserRow | null, rawRows: FakeRawRow[]) {
  const updates: UpdateRecord[] = [];
  let selectCount = 0;

  const userSelectChain = {
    from: () => userSelectChain,
    where: () => userSelectChain,
    limit: () => Promise.resolve(userRow ? [userRow] : []),
  };
  const rawSelectChain = {
    from: () => rawSelectChain,
    where: () => rawSelectChain,
    orderBy: () => rawSelectChain,
    limit: () => Promise.resolve(rawRows),
  };

  let updateTarget: "users" | "learningLog" = "users";
  let updateSet: Record<string, unknown> = {};

  const updateChain = {
    set(values: Record<string, unknown>) {
      updateSet = values;
      return updateChain;
    },
    where(_clause: unknown) {
      // We can't introspect the drizzle eq() result; record what we know.
      updates.push({
        table: updateTarget,
        set: updateSet,
        whereId: "(opaque)",
      });
      return Promise.resolve();
    },
  };

  const db = {
    select() {
      selectCount++;
      return selectCount === 1 ? userSelectChain : rawSelectChain;
    },
    update(table: unknown) {
      // Cheap identity check via constructor reference would be ideal but
      // we don't have access here; rely on ordering: 1st update is users,
      // subsequent are learningLog.
      void table;
      updateTarget = updates.length === 0 ? "users" : "learningLog";
      return updateChain;
    },
  };

  return { db: db as never, updates };
}

describe("parseDistillOutput", () => {
  it("parses a bare JSON array", () => {
    expect(parseDistillOutput('["a", "b", "c"]')).toEqual(["a", "b", "c"]);
  });

  it("strips fenced code blocks", () => {
    const raw = "```json\n[\"prefer tables\", \"no crypto\"]\n```";
    expect(parseDistillOutput(raw)).toEqual(["prefer tables", "no crypto"]);
  });

  it("extracts the array out of trailing prose", () => {
    const raw = 'Here is the list: ["x", "y"]. Hope this helps!';
    expect(parseDistillOutput(raw)).toEqual(["x", "y"]);
  });

  it("filters non-strings and empties", () => {
    const raw = '["keep", "", "  ", null, 42, "also keep"]';
    expect(parseDistillOutput(raw)).toEqual(["keep", "also keep"]);
  });

  it("throws on unparseable output", () => {
    expect(() => parseDistillOutput("not json at all")).toThrow();
  });

  it("throws on empty array after cleaning", () => {
    expect(() => parseDistillOutput("[]")).toThrow();
  });
});

describe("distillUser (T-405)", () => {
  it("returns skipped result when the user does not exist", async () => {
    const { db, updates } = buildFakeDb(null, []);
    const distill = vi.fn();

    const result = await distillUser("missing-user", { db, distill });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/not found/);
    expect(distill).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("empty-user fast path: no LLM call, no writes when no un-distilled rows", async () => {
    const { db, updates } = buildFakeDb(
      { id: "u1", distilledPrefs: ["existing pref"] },
      []
    );
    const distill = vi.fn();

    const result = await distillUser("u1", { db, distill });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toMatch(/no un-distilled/);
    expect(result.priorPrefCount).toBe(1);
    expect(result.newPrefCount).toBe(1);
    expect(result.consumedRowIds).toEqual([]);
    expect(distill).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("happy path: calls LLM, writes new prefs, stamps every consumed row", async () => {
    const rawRows: FakeRawRow[] = [
      { id: "r1", rawText: "more tables", createdAt: new Date("2026-06-02T10:00:00Z") },
      { id: "r2", rawText: "no crypto", createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "r3", rawText: "include EU angle", createdAt: new Date("2026-05-30T10:00:00Z") },
    ];
    const { db, updates } = buildFakeDb(
      { id: "u1", distilledPrefs: ["old pref to be folded"] },
      rawRows
    );
    const distill = vi.fn().mockResolvedValue({
      bullets: ["prefer tables", "avoid crypto", "include EU angle"],
      modelId: "claude-haiku-4-5-20251001",
      inputTokens: 100,
      outputTokens: 40,
      costUsd: 0.0003,
    });

    const result = await distillUser("u1", { db, distill });

    expect(result.skipped).toBe(false);
    expect(result.signalCount).toBe(3);
    expect(result.priorPrefCount).toBe(1);
    expect(result.newPrefCount).toBe(3);
    expect(result.consumedRowIds).toEqual(["r1", "r2", "r3"]);
    expect(result.costUsd).toBeCloseTo(0.0003);

    // distill called once with newest-first signals + prior prefs
    expect(distill).toHaveBeenCalledTimes(1);
    const callArgs = distill.mock.calls[0][0];
    expect(callArgs.userId).toBe("u1");
    expect(callArgs.priorPrefs).toEqual(["old pref to be folded"]);
    expect(callArgs.signals).toEqual([
      { isoDate: "2026-06-02", text: "more tables" },
      { isoDate: "2026-06-01", text: "no crypto" },
      { isoDate: "2026-05-30", text: "include EU angle" },
    ]);

    // updates: 1 users write + 3 learningLog stamps
    expect(updates).toHaveLength(4);
    expect(updates[0].table).toBe("users");
    expect(updates[0].set.distilledPrefs).toEqual([
      "prefer tables",
      "avoid crypto",
      "include EU angle",
    ]);
    for (let i = 1; i <= 3; i++) {
      expect(updates[i].table).toBe("learningLog");
      expect(updates[i].set.distilledAt).toBeInstanceOf(Date);
    }
  });

  it("handles a user with null prior prefs (first-ever distill)", async () => {
    const rawRows: FakeRawRow[] = [
      { id: "r1", rawText: "more tables", createdAt: new Date("2026-06-02T10:00:00Z") },
    ];
    const { db } = buildFakeDb({ id: "u1", distilledPrefs: null }, rawRows);
    const distill = vi.fn().mockResolvedValue({
      bullets: ["prefer tables"],
      modelId: "claude-haiku-4-5-20251001",
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.0001,
    });

    const result: WeeklyDistillPerUserResult = await distillUser("u1", { db, distill });
    expect(result.skipped).toBe(false);
    expect(result.priorPrefCount).toBe(0);
    expect(distill.mock.calls[0][0].priorPrefs).toEqual([]);
  });
});
