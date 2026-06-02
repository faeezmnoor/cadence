/**
 * T-407 (CAD-48): feedback-loop eval harness tests.
 *
 * Coverage:
 *   1. Pure metric computation against fixtures.
 *   2. engagement_rate is null (not 0) when no briefs were delivered.
 *   3. positive_rate is null when no taps.
 *   4. admin.listFeedbackEvals gate rejects non-admin callers.
 *   5. Smoke spec rows surface at top when smokeFirst=true.
 *   6. SYNTHETIC FEEDBACK PROMPT-DIFF (Notion T-407 acceptance):
 *      injecting a learning_log entry into the composer prompt produces a
 *      measurably different prompt than no-injection, AND that diff
 *      verbatim contains the injected text.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  computeFeedbackEval,
  type FeedbackEvalInput,
} from "@/server/eval/feedback-eval";
import { buildComposerSystemPrompt } from "@/server/ai/composer/prompt";
import { buildFeedbackBlock } from "@/server/ai/composer/feedback-block";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";

// ---------------------------------------------------------------------------
// 1. computeFeedbackEval — pure compute against fixtures
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<FeedbackEvalInput> = {}): FeedbackEvalInput {
  return {
    briefs: [],
    feedbackEvents: [],
    tuneCommands: [],
    distilledPrefs: null,
    ...overrides,
  };
}

describe("computeFeedbackEval", () => {
  it("computes engagement_rate and positive_rate correctly", () => {
    const now = new Date("2026-06-02T00:30:00Z");
    const out = computeFeedbackEval(
      baseInput({
        briefs: [
          { id: "b1", createdAt: now, updatedAt: now },
          { id: "b2", createdAt: now, updatedAt: now },
          { id: "b3", createdAt: now, updatedAt: now },
          { id: "b4", createdAt: now, updatedAt: now },
        ],
        feedbackEvents: [
          { vote: "up", signalType: null, source: "inline_keyboard", createdAt: now },
          { vote: "love", signalType: null, source: "inline_keyboard", createdAt: now },
          { vote: "down", signalType: null, source: "inline_keyboard", createdAt: now },
          // free_text from /tune isn't an inline-keyboard tap, must not count
          { vote: null, signalType: null, source: "tune_command", createdAt: now },
        ],
        tuneCommands: [{ createdAt: now }, { createdAt: now }],
        distilledPrefs: ["prefers tables"],
      })
    );

    expect(out.briefsDeliveredCount).toBe(4);
    expect(out.keyboardTapsCount).toBe(3); // tune_command excluded
    expect(out.engagementRate).toBe(0.75); // 3 / 4
    expect(out.positiveRate).toBe(0.6667); // (up + love) / 3, quantised
    expect(out.tuneCommandsCount).toBe(2);
    expect(out.distilledPrefsPresent).toBe(true);
    expect(out.lastBriefAt).toEqual(now);
    expect(out.lastTapAt).toEqual(now);
  });

  it("engagement_rate is NULL (not 0) when no briefs were delivered — avoids 0/0 lying", () => {
    const out = computeFeedbackEval(baseInput({ briefs: [] }));
    expect(out.briefsDeliveredCount).toBe(0);
    expect(out.engagementRate).toBeNull();
  });

  it("positive_rate is NULL when there are no keyboard taps", () => {
    const now = new Date();
    const out = computeFeedbackEval(
      baseInput({
        briefs: [{ id: "b1", createdAt: now, updatedAt: now }],
        feedbackEvents: [],
      })
    );
    expect(out.keyboardTapsCount).toBe(0);
    expect(out.positiveRate).toBeNull();
    expect(out.engagementRate).toBe(0); // 0/1 is a real zero, not null
  });

  it("treats empty-object and empty-array distilled prefs as not-present", () => {
    expect(computeFeedbackEval(baseInput({ distilledPrefs: {} })).distilledPrefsPresent).toBe(
      false
    );
    expect(
      computeFeedbackEval(baseInput({ distilledPrefs: { rules: [] } })).distilledPrefsPresent
    ).toBe(false);
    expect(
      computeFeedbackEval(baseInput({ distilledPrefs: { rules: ["x"] } })).distilledPrefsPresent
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. admin.listFeedbackEvals gate + smoke-first ordering
// ---------------------------------------------------------------------------

interface FakeEvalRow {
  userId: string;
  userEmail: string;
  windowEndDate: string;
  windowDays: number;
  briefsDeliveredCount: number;
  keyboardTapsCount: number;
  engagementRate: string | null;
  positiveRate: string | null;
  tuneCommandsCount: number;
  distilledPrefsPresent: boolean;
  lastBriefAt: Date | null;
  lastTapAt: Date | null;
  computedAt: Date;
  isSmoke: boolean;
}

const fakeRows: FakeEvalRow[] = [
  {
    userId: "user-non-smoke",
    userEmail: "nonsmoke@example.com",
    windowEndDate: "2026-06-02",
    windowDays: 7,
    briefsDeliveredCount: 7,
    keyboardTapsCount: 3,
    engagementRate: "0.4286",
    positiveRate: "0.6667",
    tuneCommandsCount: 1,
    distilledPrefsPresent: false,
    lastBriefAt: new Date("2026-06-02T00:30:00Z"),
    lastTapAt: new Date("2026-06-02T01:00:00Z"),
    computedAt: new Date("2026-06-02T01:30:00Z"),
    isSmoke: false,
  },
  {
    userId: "user-smoke",
    userEmail: "faeez@example.com",
    windowEndDate: "2026-06-01",
    windowDays: 7,
    briefsDeliveredCount: 7,
    keyboardTapsCount: 5,
    engagementRate: "0.7143",
    positiveRate: "0.8000",
    tuneCommandsCount: 2,
    distilledPrefsPresent: true,
    lastBriefAt: new Date("2026-06-01T00:30:00Z"),
    lastTapAt: new Date("2026-06-01T01:00:00Z"),
    computedAt: new Date("2026-06-01T01:30:00Z"),
    isSmoke: true,
  },
];

let querySmokeOnly = false;
let querySmokeFirst = true;

vi.mock("@/server/db/client", () => {
  return {
    db: {
      select() {
        return {
          from() {
            return this;
          },
          innerJoin() {
            return this;
          },
          where() {
            return this;
          },
          orderBy() {
            return this;
          },
          limit(_n: number) {
            let pool = fakeRows.slice();
            if (querySmokeOnly) pool = pool.filter((r) => r.isSmoke);
            // Emulate the SQL order: smoke DESC, then window_end_date DESC
            pool.sort((a, b) => {
              if (querySmokeFirst && a.isSmoke !== b.isSmoke) {
                return a.isSmoke ? -1 : 1;
              }
              return b.windowEndDate.localeCompare(a.windowEndDate);
            });
            return Promise.resolve(pool);
          },
        };
      },
    },
  };
});

import { appRouter } from "@/server/trpc/root";

function makeCtx(overrides: { email?: string | null; signedIn?: boolean } = {}) {
  const signedIn = overrides.signedIn ?? true;
  return {
    user: signedIn
      ? { id: "u-self", email: overrides.email ?? "admin@example.com" }
      : null,
    supabase: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

beforeEach(() => {
  process.env.CADENCE_ADMIN_EMAILS = "admin@example.com";
  querySmokeOnly = false;
  querySmokeFirst = true;
});

describe("admin.listFeedbackEvals gate", () => {
  it("rejects signed-out callers with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeCtx({ signedIn: false }));
    await expect(caller.admin.listFeedbackEvals()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects signed-in non-admin with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      makeCtx({ email: "stranger@example.com" })
    );
    await expect(caller.admin.listFeedbackEvals()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("surfaces the smoke spec row first when smokeFirst=true", async () => {
    const caller = appRouter.createCaller(makeCtx());
    querySmokeFirst = true;
    const out = await caller.admin.listFeedbackEvals({
      smokeFirst: true,
      smokeOnly: false,
      limit: 100,
    });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.rows[0]!.isSmoke).toBe(true);
    expect(out.rows[0]!.userEmail).toBe("faeez@example.com");
  });

  it("smokeOnly filters to smoke users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    querySmokeOnly = true;
    const out = await caller.admin.listFeedbackEvals({
      smokeFirst: true,
      smokeOnly: true,
      limit: 100,
    });
    expect(out.rows.every((r) => r.isSmoke)).toBe(true);
    expect(out.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. SYNTHETIC FEEDBACK PROMPT-DIFF (Notion T-407 acceptance)
//
// Inject a single sample learning_log entry through the feedback-block
// builder into the composer prompt. The prompt with injection must differ
// from the prompt without injection, AND the verbatim raw_text must appear
// in the with-injection prompt.
// ---------------------------------------------------------------------------

describe("synthetic feedback → composer prompt diff (T-407 acceptance)", () => {
  const SAMPLE_LEARNING = "stop talking about durian futures";
  const spec = emptyDigestSpec();
  const sources = { search: [], rss: [] };

  it("injecting a learning_log entry produces a measurably different prompt", () => {
    const baseline = buildComposerSystemPrompt({ spec, sources });

    // Simulate the composer's call site: build the feedback block from a
    // single fresh learning_log row, then thread the result into the
    // prompt builder exactly as the production composer does.
    const block = buildFeedbackBlock({
      distilledPrefs: null,
      rawCandidates: [
        {
          id: "ll-1",
          rawText: SAMPLE_LEARNING,
          createdAt: new Date("2026-06-01T00:00:00Z"),
        },
      ],
    });

    expect(block.consumedRawIds).toEqual(["ll-1"]);
    expect(block.recentRawNotes.length).toBe(1);

    const withInjection = buildComposerSystemPrompt({
      spec,
      sources,
      distilledPrefs: block.distilledPrefs,
      recentRawNotes: block.recentRawNotes,
    });

    // Hard diff assertions:
    expect(withInjection).not.toBe(baseline);
    expect(withInjection.length).toBeGreaterThan(baseline.length);
    // The raw user phrase appears verbatim in the with-injection prompt.
    expect(withInjection).toContain(SAMPLE_LEARNING);
    // The baseline must NOT contain it (sanity: no leak).
    expect(baseline).not.toContain(SAMPLE_LEARNING);
  });

  it("distilled prefs alone (no raw) still produce a measurable diff", () => {
    const baseline = buildComposerSystemPrompt({ spec, sources });
    const withDistilled = buildComposerSystemPrompt({
      spec,
      sources,
      distilledPrefs: ["bias toward Malaysian commodities"],
    });
    expect(withDistilled).not.toBe(baseline);
    expect(withDistilled).toContain("bias toward Malaysian commodities");
  });
});
