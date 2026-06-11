/**
 * Event-triggered distill (CAD-220, Part 2).
 *
 * Drives the exported helpers directly with fakes — no real DB, no
 * Inngest, no LLM (same approach as weekly-distill.test.ts; the Inngest
 * wiring is trivial). Covers the trigger rules:
 *
 *   - ≥3 un-distilled signals → distill runs
 *   - <3 fresh signals → no distill (the Sunday sweep will get them)
 *   - oldest un-distilled row >72h old → distill runs even below count
 *   - zero pending rows → no distill, no LLM call
 *
 * The actual fold is weekly-distill's distillUser — shared by both paths
 * and already covered by weekly-distill.test.ts — so here it's a stub.
 */
import { describe, it, expect, vi } from "vitest";
import {
  checkDistillThreshold,
  runDistillOnSignal,
  DISTILL_MAX_PENDING_AGE_HOURS,
  DISTILL_SIGNAL_THRESHOLD,
} from "@/server/inngest/functions/distill-on-signal";

const NOW = new Date("2026-06-11T08:00:00Z");

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

/**
 * Fake drizzle-like DB for the single pending-rows query:
 * select({createdAt}).from(learningLog).where(...).orderBy(asc).limit(...)
 * Rows must be passed oldest-first, as the real query orders them.
 */
function buildFakeDb(pendingCreatedAts: Date[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(pendingCreatedAts.map((createdAt) => ({ createdAt }))),
  };
  return { select: () => chain } as never;
}

const stubResult = {
  userId: "u1",
  signalCount: 3,
  skipped: false,
  priorPrefCount: 0,
  newPrefCount: 2,
  consumedRowIds: ["r1", "r2", "r3"],
  costUsd: 0.0003,
};

describe("checkDistillThreshold", () => {
  it("triggers at >=3 pending signals, however fresh", () => {
    expect(DISTILL_SIGNAL_THRESHOLD).toBe(3);
    return checkDistillThreshold("u1", {
      db: buildFakeDb([hoursAgo(2), hoursAgo(1), hoursAgo(0.5)]),
      now: NOW,
    }).then((check) => {
      expect(check.shouldDistill).toBe(true);
      expect(check.pendingCount).toBe(3);
    });
  });

  it("does NOT trigger below 3 fresh signals", async () => {
    const check = await checkDistillThreshold("u1", {
      db: buildFakeDb([hoursAgo(5), hoursAgo(1)]),
      now: NOW,
    });
    expect(check.shouldDistill).toBe(false);
    expect(check.pendingCount).toBe(2);
  });

  it("triggers when the oldest pending signal is older than 72h, even with a single row", async () => {
    expect(DISTILL_MAX_PENDING_AGE_HOURS).toBe(72);
    const check = await checkDistillThreshold("u1", {
      db: buildFakeDb([hoursAgo(80)]),
      now: NOW,
    });
    expect(check.shouldDistill).toBe(true);
    expect(check.pendingCount).toBe(1);
    expect(check.oldestPendingAgeHours).toBeCloseTo(80, 5);
  });

  it("does NOT trigger at exactly-under-the-age boundary", async () => {
    const check = await checkDistillThreshold("u1", {
      db: buildFakeDb([hoursAgo(71.9)]),
      now: NOW,
    });
    expect(check.shouldDistill).toBe(false);
  });

  it("no pending rows → nothing to do", async () => {
    const check = await checkDistillThreshold("u1", {
      db: buildFakeDb([]),
      now: NOW,
    });
    expect(check.shouldDistill).toBe(false);
    expect(check.pendingCount).toBe(0);
    expect(check.oldestPendingAgeHours).toBeNull();
  });
});

describe("runDistillOnSignal", () => {
  it(">=3 signals: runs the shared per-user distill for THAT user only", async () => {
    const perUserDistill = vi.fn().mockResolvedValue(stubResult);

    const out = await runDistillOnSignal("u1", {
      db: buildFakeDb([hoursAgo(3), hoursAgo(2), hoursAgo(1)]),
      now: NOW,
      perUserDistill,
    });

    expect(out.distilled).toBe(true);
    expect(out.result).toEqual(stubResult);
    expect(perUserDistill).toHaveBeenCalledTimes(1);
    expect(perUserDistill.mock.calls[0]![0]).toBe("u1");
  });

  it("<3 fresh signals: skips the distill entirely (no LLM spend)", async () => {
    const perUserDistill = vi.fn();

    const out = await runDistillOnSignal("u1", {
      db: buildFakeDb([hoursAgo(3), hoursAgo(1)]),
      now: NOW,
      perUserDistill,
    });

    expect(out.distilled).toBe(false);
    expect(out.result).toBeUndefined();
    expect(perUserDistill).not.toHaveBeenCalled();
  });

  it("a single 72h-old signal: distills anyway so notes can't rot for a week", async () => {
    const perUserDistill = vi.fn().mockResolvedValue({
      ...stubResult,
      signalCount: 1,
      consumedRowIds: ["r1"],
    });

    const out = await runDistillOnSignal("u1", {
      db: buildFakeDb([hoursAgo(73)]),
      now: NOW,
      perUserDistill,
    });

    expect(out.distilled).toBe(true);
    expect(perUserDistill).toHaveBeenCalledTimes(1);
  });
});
