/**
 * Slice 005 (decision 0013): domain bounds on the scheduling rule's arrays,
 * and the memory shape of the guard in front of them.
 *
 * Limits:
 *   - `weekdays` (daily and weekly cadence): 7 — there are seven ISO weekdays.
 *   - `skipDates`: 366 — one year of daily skips; skipping more than that is
 *     what `endDate` (or pausing the brief) is for.
 *
 * `.max()` alone does not bound memory on zod 3.25.76 (every element is still
 * parsed after the breach), so the memory-shape test proves the parser is
 * never handed an oversized array: the body-size guard refuses it first.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MAX_SKIP_DATES,
  MAX_WEEKDAYS,
  schedulingRuleV1,
} from "@/lib/scheduling/rule";
import { TRPC_BODY_LIMIT_BYTES, withBodyLimit } from "@/server/http/body-limit";

const base = {
  version: 1 as const,
  startDate: "2026-11-13",
  timeLocal: "08:00",
  timezone: "Asia/Kuala_Lumpur",
};

const days = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2027, 0, 1 + i));
    return d.toISOString().slice(0, 10);
  });

describe("schedulingRuleV1 array bounds", () => {
  it("states the domain limits", () => {
    expect(MAX_WEEKDAYS).toBe(7);
    expect(MAX_SKIP_DATES).toBe(366);
  });

  it("accepts seven weekdays and refuses eight (daily)", () => {
    const ok = schedulingRuleV1.safeParse({ ...base, cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7] } });
    expect(ok.success).toBe(true);
    const bad = schedulingRuleV1.safeParse({ ...base, cadence: { kind: "daily", weekdays: [1, 2, 3, 4, 5, 6, 7, 1] } });
    expect(bad.success).toBe(false);
  });

  it("accepts seven weekdays and refuses eight (weekly)", () => {
    const ok = schedulingRuleV1.safeParse({ ...base, cadence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 7] } });
    expect(ok.success).toBe(true);
    const bad = schedulingRuleV1.safeParse({ ...base, cadence: { kind: "weekly", weekdays: [1, 2, 3, 4, 5, 6, 7, 7] } });
    expect(bad.success).toBe(false);
  });

  it("accepts 366 skip dates and refuses 367", () => {
    const cadence = { kind: "daily" as const };
    expect(schedulingRuleV1.safeParse({ ...base, cadence, skipDates: days(366) }).success).toBe(true);
    const bad = schedulingRuleV1.safeParse({ ...base, cadence, skipDates: days(367) });
    expect(bad.success).toBe(false);
  });
});

describe("memory shape: the parser never sees an oversized array", () => {
  // A stand-in for a body-parsed input that hands an array to Zod. The one
  // caller path to schedulingRuleV1 is briefs.preview, a GET query with no
  // body: its input is bounded by the URL length (notes.md, review F6).
  const parseSpy = vi.spyOn(schedulingRuleV1, "safeParse");
  const route = withBodyLimit(async (req: Request) => {
    const input = (await req.json()) as { rule: unknown };
    const r = schedulingRuleV1.safeParse(input.rule);
    return Response.json({ ok: r.success }, { status: r.success ? 200 : 400 });
  }, TRPC_BODY_LIMIT_BYTES);

  it("a 4 MB skipDates body (the measured 690 MB case) is refused before parsing", async () => {
    parseSpy.mockClear();
    const n = 2 * 1024 * 1024; // ~4 MB of `0,`
    const body = `{"rule":{"skipDates":[${"0,".repeat(n - 1)}0]}}`;
    const res = await route(new Request("https://x.test/api/trpc", { method: "POST", body }));
    expect(res.status).toBe(413);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it("an under-limit rule still reaches the parser", async () => {
    parseSpy.mockClear();
    const body = JSON.stringify({ rule: { ...base, cadence: { kind: "daily" }, skipDates: days(366) } });
    const res = await route(new Request("https://x.test/api/trpc", { method: "POST", body }));
    expect(res.status).toBe(200);
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(body.length).toBeLessThan(TRPC_BODY_LIMIT_BYTES);
  });
});
