/**
 * Tests for the slot extractor (Workstream B).
 *
 * We mock the AI SDK `generateObject` so the suite stays offline + cheap.
 * Live precision/recall scoring on the golden set is a separate, on-demand
 * `tsx server/eval/run-extractor-eval.ts` script (not wired to CI).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateObjectMock = vi.fn();

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateObject: (...args: unknown[]) => generateObjectMock(...args),
  };
});

import { extractSlots } from "@/server/ai/config-agent/extract";

beforeEach(() => {
  generateObjectMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("extractSlots", () => {
  it("returns disabled status on an empty message", async () => {
    const r = await extractSlots({
      latestUserMessage: "   ",
      draft: undefined,
    });
    expect(r.status).toBe("disabled");
    expect(r.slots).toEqual({});
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns slots on successful extraction", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        industry: { value: "crypto", confidence: 0.95, source: "explicit" },
        frequency: { value: "daily", confidence: 0.95, source: "explicit" },
      },
    });
    const r = await extractSlots({
      latestUserMessage: "daily crypto news please",
      draft: undefined,
    });
    expect(r.status).toBe("ok");
    expect(r.slots.industry?.value).toBe("crypto");
    expect(r.slots.frequency?.value).toBe("daily");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns error status when the model call rejects", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("rate limited"));
    const r = await extractSlots({
      latestUserMessage: "weekly crypto news",
      draft: undefined,
    });
    expect(r.status).toBe("error");
    expect(r.slots).toEqual({});
    expect(r.error).toContain("rate limited");
  });
});
