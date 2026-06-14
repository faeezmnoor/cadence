/**
 * Brief manage mode — updateSpecInPlace (plan §4.3.3, AC3.1/AC3.2/AC6.1).
 *
 * Mock-db transaction tests (digest-retry pattern):
 *   - same id forever, version + 1, spec replaced, name recomputed
 *   - scheduling + next_run_at recomputed IFF cadence changed (timezone
 *     reused from the existing rule — snapshot-immutable per spec)
 *   - paused rows keep next_run_at NULL even on cadence change
 *   - archived / missing rows throw, NO write
 *   - CAP-BYPASS module-mock assertion (AC3.2/AC6.1): the brief-count gate
 *     (server/briefs/limit) and saveSpecForUser are mocked to throw if
 *     touched — an edit must never reach cap code, so a Free user at cap
 *     can always edit their one brief without an archived duplicate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

const state = vi.hoisted(() => ({
  existingRows: [] as Array<Record<string, unknown>>,
  updateSets: [] as Array<Record<string, unknown>>,
  updateReturn: [] as Array<{ id: string; version: number }>,
}));

const capSpies = vi.hoisted(() => ({
  maxBriefsForEmail: vi.fn(() => {
    throw new Error("CAP CODE REACHED — updateSpecInPlace must never call maxBriefsForEmail");
  }),
  saveSpecForUser: vi.fn(() => {
    throw new Error("CAP PATH REACHED — updateSpecInPlace must never call saveSpecForUser");
  }),
}));

// Module-mock cap-bypass assertion (plan §6): if updateSpecInPlace (or any
// module it imports) ever calls into the cap gate, these throw and the
// behavioral tests below fail loudly.
vi.mock("@/server/briefs/limit", () => ({
  maxBriefsForEmail: capSpies.maxBriefsForEmail,
  SINGLE_BRIEF_NOTICE: "stub-notice",
}));
vi.mock("@/server/ai/config-agent/save-spec", () => ({
  saveSpecForUser: capSpies.saveSpecForUser,
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/db/client", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(state.existingRows),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            state.updateSets.push(vals);
            return Promise.resolve(state.updateReturn);
          },
        }),
      }),
    }),
  };
  return {
    db: {
      transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    },
  };
});

import {
  changedTopLevelKeys,
  updateSpecInPlace,
} from "@/server/ai/config-agent/update-spec";
import { log } from "@/lib/log";

const USER = "u-self";
const SPEC_ID = "11111111-1111-1111-1111-111111111111";

const CADENCE = {
  frequency: "daily" as const,
  delivery_time_local: "08:00",
  days_of_week: [1, 2, 3, 4, 5],
};

function makeSpec(overrides: Partial<DigestSpecV1> = {}): DigestSpecV1 {
  return {
    schema_version: 1,
    topics: ["palm oil supply chain"],
    entities: { companies: [], tickers: [], commodities: [] },
    keywords_include: [],
    keywords_exclude: [],
    data_addons: {
      show_prices: false,
      show_24h_change: true,
      show_7d_change: false,
      fx_pairs: [],
    },
    rss_feeds: [],
    cadence: CADENCE,
    tone_preset: "executive_brief",
    length_target: "short",
    language: "en",
    ...overrides,
  };
}

const EXISTING_SCHEDULING = {
  version: 1,
  startDate: "2026-06-01",
  endDate: null,
  timeLocal: "08:00",
  timezone: "America/New_York",
  cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5] },
  skipDates: [],
  skipWhen: {},
};

function seedExisting(overrides: Record<string, unknown> = {}) {
  state.existingRows = [
    {
      id: SPEC_ID,
      version: 3,
      spec: makeSpec(),
      status: "active",
      scheduling: EXISTING_SCHEDULING,
      ...overrides,
    },
  ];
  state.updateReturn = [{ id: SPEC_ID, version: 4 }];
}

beforeEach(() => {
  state.existingRows = [];
  state.updateSets = [];
  state.updateReturn = [];
  capSpies.maxBriefsForEmail.mockClear();
  capSpies.saveSpecForUser.mockClear();
  (log.info as ReturnType<typeof vi.fn>).mockClear();
});

describe("updateSpecInPlace", () => {
  it("updates the SAME row: version+1, spec replaced, name recomputed (AC3.1)", async () => {
    seedExisting();
    const next = makeSpec({ topics: ["soybean futures"] });
    const out = await updateSpecInPlace({ userId: USER, specId: SPEC_ID, spec: next });

    expect(out).toEqual({ id: SPEC_ID, version: 4 });
    expect(state.updateSets).toHaveLength(1);
    const set = state.updateSets[0]!;
    expect(set.version).toBe(4);
    expect(set.spec).toEqual(next);
    expect(set.name).toBe("Soybean futures brief");
    // No status flip, no is_current churn, no insert — in place forever.
    expect(set.status).toBeUndefined();
    expect(set.isCurrent).toBeUndefined();
  });

  it("does NOT recompute scheduling when the cadence is unchanged", async () => {
    seedExisting();
    await updateSpecInPlace({
      userId: USER,
      specId: SPEC_ID,
      spec: makeSpec({ topics: ["corn"] }),
    });
    const set = state.updateSets[0]!;
    expect(set.scheduling).toBeUndefined();
    expect(set.nextRunAt).toBeUndefined();
  });

  it("recomputes scheduling + nextRunAt iff cadence changed, reusing the spec's timezone", async () => {
    seedExisting();
    await updateSpecInPlace({
      userId: USER,
      specId: SPEC_ID,
      spec: makeSpec({
        cadence: { ...CADENCE, delivery_time_local: "18:30" },
      }),
    });
    const set = state.updateSets[0]!;
    const scheduling = set.scheduling as {
      timeLocal: string;
      timezone: string;
    };
    expect(scheduling.timeLocal).toBe("18:30");
    // Snapshot-immutable timezone: the EXISTING rule's tz survives the edit.
    expect(scheduling.timezone).toBe("America/New_York");
    expect(set.nextRunAt).toBeInstanceOf(Date);
  });

  it("paused rows keep nextRunAt NULL on cadence change (resume recomputes)", async () => {
    seedExisting({ status: "paused" });
    await updateSpecInPlace({
      userId: USER,
      specId: SPEC_ID,
      spec: makeSpec({
        cadence: { ...CADENCE, frequency: "weekly" as const, days_of_week: [1] },
      }),
    });
    const set = state.updateSets[0]!;
    expect(set.scheduling).toBeDefined();
    expect(set.nextRunAt).toBeNull();
  });

  it("rejects archived specs with NO write (AC8.1)", async () => {
    seedExisting({ status: "archived" });
    await expect(
      updateSpecInPlace({ userId: USER, specId: SPEC_ID, spec: makeSpec() })
    ).rejects.toThrow(/archived/);
    expect(state.updateSets).toHaveLength(0);
  });

  it("rejects missing/unowned specs with NO write", async () => {
    state.existingRows = [];
    await expect(
      updateSpecInPlace({ userId: USER, specId: SPEC_ID, spec: makeSpec() })
    ).rejects.toThrow(/no longer exists/);
    expect(state.updateSets).toHaveLength(0);
  });

  it("NEVER touches cap code — maxBriefsForEmail / saveSpecForUser uncalled (AC3.2/AC6.1)", async () => {
    seedExisting();
    await updateSpecInPlace({
      userId: USER,
      specId: SPEC_ID,
      spec: makeSpec({ topics: ["corn", "soybeans"] }),
    });
    expect(capSpies.maxBriefsForEmail).not.toHaveBeenCalled();
    expect(capSpies.saveSpecForUser).not.toHaveBeenCalled();
  });

  it("fires brief_edit_applied with version_from/to + fields_changed (ACX.5)", async () => {
    seedExisting();
    await updateSpecInPlace({
      userId: USER,
      specId: SPEC_ID,
      spec: makeSpec({ topics: ["corn"], length_target: "medium" as const }),
    });
    const info = log.info as ReturnType<typeof vi.fn>;
    const call = info.mock.calls.find((c) => c[0] === "brief_edit_applied");
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({
      userId: USER,
      specId: SPEC_ID,
      version_from: 3,
      version_to: 4,
      fields_changed: ["length_target", "topics"],
    });
  });
});

describe("changedTopLevelKeys", () => {
  it("diffs top-level keys, sorted; tolerates malformed before-specs", () => {
    const after = makeSpec({ topics: ["corn"] });
    expect(changedTopLevelKeys(makeSpec(), after)).toEqual(["topics"]);
    expect(changedTopLevelKeys(makeSpec(), makeSpec())).toEqual([]);
    expect(changedTopLevelKeys(null, makeSpec()).length).toBeGreaterThan(0);
  });
});
