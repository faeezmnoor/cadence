/**
 * CAD-219 — composer self-repair.
 *
 * Covers, pure-function-first:
 *   1. Deterministic unused-source prune + renumber (pure, $0).
 *   2. parseBriefOutcome defect classification (parse / schema / parity).
 *   3. composeBriefWithRepair: one bounded compose-only retry with a
 *      corrective addendum, then throw (pipeline semantics unchanged).
 *   4. Module-boundary: composeDigest (Haiku) and composeDigestPro
 *      (Sonnet) both run the shared driver — mocked `generateText`,
 *      exactly 2 invocations on a defect, summed cost, maxTokens 3000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "mock-model") }));
vi.mock("@/server/cost/record", () => ({
  anthropicCostUsd: vi.fn((_m: string, inTok: number, outTok: number) => {
    // 1e-6 per token either way — keeps summed-token assertions easy.
    return (inTok + outTok) * 1e-6;
  }),
  recordCost: vi.fn(async () => {}),
}));
vi.mock("@/lib/log", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { generateText } from "ai";
import { recordCost } from "@/server/cost/record";
import {
  pruneUnusedSources,
  renumberMarkersInText,
  checkCitationParity,
  ComposerJsonError,
  type BriefJson,
} from "@/server/ai/composer/schema";
import {
  composeBriefWithRepair,
  composeDigest,
  parseBriefOutcome,
  parseAndValidateBrief,
  buildCorrectiveAddendum,
  COMPOSER_MAX_OUTPUT_TOKENS,
  type ComposerModelAttempt,
} from "@/server/ai/composer/compose";
import { composeDigestPro } from "@/server/ai/providers/anthropic-pro";
import type { ComposerInput } from "@/server/ai/composer/types";
import { emptyDigestSpec } from "@/lib/digest-spec/schema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Valid brief: markers 2, 3, 5 cited across tldr + sections + closer. */
function briefWithUnused(): BriefJson {
  return {
    schema_version: 1,
    header: {
      date: "11 Jun 2026",
      cadence_label: "Daily",
      industry: "Palm oil",
      personalization_summary: "KL trader",
    },
    tldr: "CPO holds; quota lifted [2].",
    sections: [
      {
        heading: "Prices",
        bullets: [{ text: "CPO RM3,920 [3]", citation_markers: [3] }],
      },
      {
        heading: "Watch",
        bullets: [{ text: "Felda results Thursday", citation_markers: [5] }],
      },
    ],
    why_it_matters: "Your CPO short benefits [5].",
    feedback_cta: "Reply 👍 / 👎",
    sources: [
      { marker: 1, title: "Unused A", url: "https://example.com/a" },
      { marker: 2, title: "MPOB", url: "https://mpob.gov.my/q" },
      { marker: 3, title: "Reuters", url: "https://reuters.com/x" },
      { marker: 4, title: "Unused B", url: "https://example.com/b" },
      { marker: 5, title: "Felda IR", url: "https://felda.com.my/ir" },
    ],
  };
}

/** Fully clean brief — parity ok. */
function cleanBrief(): BriefJson {
  return {
    schema_version: 1,
    header: {
      date: "11 Jun 2026",
      cadence_label: "Daily",
      industry: "Palm oil",
      personalization_summary: "KL trader",
    },
    tldr: "CPO holds [1].",
    sections: [
      {
        heading: "Prices",
        bullets: [{ text: "CPO RM3,920 [2]", citation_markers: [2] }],
      },
    ],
    why_it_matters: "Your CPO short benefits.",
    feedback_cta: "Reply 👍 / 👎",
    sources: [
      { marker: 1, title: "MPOB", url: "https://mpob.gov.my/q" },
      { marker: 2, title: "Reuters", url: "https://reuters.com/x" },
    ],
  };
}

function composerInput(): ComposerInput {
  return {
    spec: emptyDigestSpec(),
    sources: { search: [], rss: [] },
    digestRunId: "run-1",
    userId: "user-1",
  };
}

const usage = { promptTokens: 100, completionTokens: 50 };

// ---------------------------------------------------------------------------
// 1. Deterministic prune + renumber (pure)
// ---------------------------------------------------------------------------

describe("renumberMarkersInText", () => {
  it("rewrites mapped markers in a single pass without collisions", () => {
    const map = new Map([
      [2, 1],
      [3, 2],
      [5, 3],
    ]);
    expect(renumberMarkersInText("a [2] b [3] c [5] d [2]", map)).toBe(
      "a [1] b [2] c [3] d [1]"
    );
  });

  it("leaves unmapped markers and non-marker brackets untouched", () => {
    const map = new Map([[2, 1]]);
    expect(renumberMarkersInText("x [2] y [9] z [abc]", map)).toBe(
      "x [1] y [9] z [abc]"
    );
  });
});

describe("pruneUnusedSources", () => {
  it("prunes unused sources and renumbers markers everywhere", () => {
    const result = pruneUnusedSources(briefWithUnused());
    expect(result).not.toBeNull();
    const { brief, prunedUnused } = result!;

    expect(prunedUnused).toBe(2); // markers 1 and 4 dropped

    // Renumber map: 2→1, 3→2, 5→3 (order-stable, ascending old marker).
    expect(brief.sources).toEqual([
      { marker: 1, title: "MPOB", url: "https://mpob.gov.my/q" },
      { marker: 2, title: "Reuters", url: "https://reuters.com/x" },
      { marker: 3, title: "Felda IR", url: "https://felda.com.my/ir" },
    ]);

    // Inline markers in tldr, bullets, why_it_matters all renumbered.
    expect(brief.tldr).toBe("CPO holds; quota lifted [1].");
    expect(brief.sections[0].bullets[0].text).toBe("CPO RM3,920 [2]");
    expect(brief.why_it_matters).toBe("Your CPO short benefits [3].");

    // citation_markers arrays renumbered too (including marker-only bullet).
    expect(brief.sections[0].bullets[0].citation_markers).toEqual([2]);
    expect(brief.sections[1].bullets[0].citation_markers).toEqual([3]);
  });

  it("repaired brief passes citation parity", () => {
    const { brief } = pruneUnusedSources(briefWithUnused())!;
    expect(checkCitationParity(brief).ok).toBe(true);
  });

  it("never mutates content — only markers change", () => {
    const { brief } = pruneUnusedSources(briefWithUnused())!;
    // Strip markers and compare prose.
    const strip = (s: string) => s.replace(/\[\d{1,2}\]/g, "[n]");
    const original = briefWithUnused();
    expect(strip(brief.tldr)).toBe(strip(original.tldr));
    expect(strip(brief.why_it_matters)).toBe(strip(original.why_it_matters));
    expect(brief.sections.map((s) => s.heading)).toEqual(
      original.sections.map((s) => s.heading)
    );
    expect(brief.header).toEqual(original.header);
    expect(brief.feedback_cta).toBe(original.feedback_cta);
  });

  it("does not mutate the input brief", () => {
    const input = briefWithUnused();
    const snapshot = JSON.parse(JSON.stringify(input));
    pruneUnusedSources(input);
    expect(input).toEqual(snapshot);
  });

  it("returns null when parity is already ok", () => {
    expect(pruneUnusedSources(cleanBrief())).toBeNull();
  });

  it("returns null when missing sources exist (content defect — not repairable)", () => {
    const b = briefWithUnused();
    b.tldr = "Something [9] and [2].";
    expect(pruneUnusedSources(b)).toBeNull();
  });

  it("returns null when ALL sources are unused (citation-free brief)", () => {
    const b = cleanBrief();
    b.tldr = "No citations here.";
    b.sections[0].bullets = [{ text: "No marker", citation_markers: [] }];
    expect(pruneUnusedSources(b)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. parseBriefOutcome / parseAndValidateBrief
// ---------------------------------------------------------------------------

describe("parseBriefOutcome", () => {
  it("returns ok with prunedUnused=0 on a clean brief", () => {
    const outcome = parseBriefOutcome(JSON.stringify(cleanBrief()));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.prunedUnused).toBe(0);
  });

  it("repairs an unused-source-only brief instead of failing", () => {
    const outcome = parseBriefOutcome(JSON.stringify(briefWithUnused()));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.prunedUnused).toBe(2);
      expect(checkCitationParity(outcome.brief).ok).toBe(true);
    }
  });

  it("classifies missing-source parity as a citation_parity defect", () => {
    const b = cleanBrief();
    b.tldr = "Cites a ghost [7] and [1].";
    const outcome = parseBriefOutcome(JSON.stringify(b));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.defect.kind).toBe("citation_parity");
      expect(outcome.message).toContain("citation parity failed");
      expect(outcome.message).toContain("missing sources for markers [7]");
      if (outcome.defect.kind === "citation_parity") {
        expect(outcome.defect.missingSources).toEqual([7]);
        expect(outcome.defect.declaredMarkers).toEqual([1, 2]);
      }
    }
  });

  it("classifies truncated JSON as invalid_json", () => {
    const truncated = JSON.stringify(cleanBrief()).slice(0, 80);
    const outcome = parseBriefOutcome(truncated);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.defect.kind).toBe("invalid_json");
      expect(outcome.message).toContain("unbalanced braces");
    }
  });

  it("classifies a schema miss as invalid_schema", () => {
    const bad = { ...cleanBrief(), why_it_matters: "" };
    const outcome = parseBriefOutcome(JSON.stringify(bad));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.defect.kind).toBe("invalid_schema");
      expect(outcome.message).toContain("schema validation failed");
    }
  });
});

describe("parseAndValidateBrief (exported wrapper)", () => {
  it("returns the repaired brief on unused-only parity (no throw)", () => {
    const brief = parseAndValidateBrief(JSON.stringify(briefWithUnused()));
    expect(checkCitationParity(brief).ok).toBe(true);
    expect(brief.sources).toHaveLength(3);
  });

  it("still throws ComposerJsonError on missing sources", () => {
    const b = cleanBrief();
    b.tldr = "Ghost [7] plus [1].";
    expect(() => parseAndValidateBrief(JSON.stringify(b))).toThrow(
      ComposerJsonError
    );
  });
});

// ---------------------------------------------------------------------------
// 3. composeBriefWithRepair — bounded retry driver (pure callModel mock)
// ---------------------------------------------------------------------------

describe("composeBriefWithRepair", () => {
  const ctx = { modelId: "test-model", digestRunId: "run-1" };

  function attempt(text: string): ComposerModelAttempt {
    return { text, inputTokens: 100, outputTokens: 50 };
  }

  it("clean first attempt: one call, no repair info", async () => {
    const callModel = vi.fn(async (_addendum?: string) =>
      attempt(JSON.stringify(cleanBrief()))
    );
    const result = await composeBriefWithRepair(callModel, ctx);
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(callModel.mock.calls[0]?.[0]).toBeUndefined(); // no corrective addendum
    expect(result.repair).toBeUndefined();
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  it("unused-only defect: deterministic repair, NO retry", async () => {
    const callModel = vi.fn(async () =>
      attempt(JSON.stringify(briefWithUnused()))
    );
    const result = await composeBriefWithRepair(callModel, ctx);
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(result.repair).toEqual({ prunedUnused: 2 });
    expect(checkCitationParity(result.brief).ok).toBe(true);
  });

  it("missing-source defect: exactly one retry with a corrective addendum", async () => {
    const bad = cleanBrief();
    bad.tldr = "Ghost [7] plus [1].";
    const callModel = vi
      .fn<(addendum?: string) => Promise<ComposerModelAttempt>>()
      .mockResolvedValueOnce(attempt(JSON.stringify(bad)))
      .mockResolvedValueOnce(attempt(JSON.stringify(cleanBrief())));

    const result = await composeBriefWithRepair(callModel, ctx);

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0]).toBeUndefined();
    const addendum = callModel.mock.calls[1][0]!;
    expect(addendum).toContain("CORRECTION REQUIRED");
    expect(addendum).toContain("[7]");
    expect(addendum).toContain("1, 2"); // declared markers
    expect(addendum).toContain("Do NOT invent sources");

    expect(result.repair).toEqual({ composeRetries: 1 });
    // Tokens summed across both attempts.
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(100);
  });

  it("truncated JSON: retry addendum mentions truncation", async () => {
    const truncated = JSON.stringify(cleanBrief()).slice(0, 80);
    const callModel = vi
      .fn<(addendum?: string) => Promise<ComposerModelAttempt>>()
      .mockResolvedValueOnce(attempt(truncated))
      .mockResolvedValueOnce(attempt(JSON.stringify(cleanBrief())));

    const result = await composeBriefWithRepair(callModel, ctx);

    expect(callModel).toHaveBeenCalledTimes(2);
    const addendum = callModel.mock.calls[1][0]!;
    expect(addendum).toContain("truncated mid-JSON");
    expect(addendum).toContain("COMPLETE object");
    expect(result.repair).toEqual({ composeRetries: 1 });
  });

  it("retry can ALSO be deterministically repaired (retry + prune both stamped)", async () => {
    const bad = cleanBrief();
    bad.tldr = "Ghost [7] plus [1].";
    const callModel = vi
      .fn<(addendum?: string) => Promise<ComposerModelAttempt>>()
      .mockResolvedValueOnce(attempt(JSON.stringify(bad)))
      .mockResolvedValueOnce(attempt(JSON.stringify(briefWithUnused())));

    const result = await composeBriefWithRepair(callModel, ctx);
    expect(result.repair).toEqual({ prunedUnused: 2, composeRetries: 1 });
  });

  it("retry-then-throw: second failure throws ComposerJsonError, exactly 2 calls", async () => {
    const bad = cleanBrief();
    bad.tldr = "Ghost [7] plus [1].";
    const callModel = vi
      .fn<(addendum?: string) => Promise<ComposerModelAttempt>>()
      .mockResolvedValue(attempt(JSON.stringify(bad)));

    await expect(composeBriefWithRepair(callModel, ctx)).rejects.toThrow(
      ComposerJsonError
    );
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("transport errors are NOT retried — they propagate immediately", async () => {
    const callModel = vi
      .fn<(addendum?: string) => Promise<ComposerModelAttempt>>()
      .mockRejectedValue(new Error("fetch failed"));

    await expect(composeBriefWithRepair(callModel, ctx)).rejects.toThrow(
      "fetch failed"
    );
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});

describe("buildCorrectiveAddendum", () => {
  it("unused-only parity defect (unrepairable case) names the unused markers", () => {
    const addendum = buildCorrectiveAddendum({
      kind: "citation_parity",
      missingSources: [],
      unusedSources: [1, 2],
      declaredMarkers: [1, 2],
    });
    expect(addendum).toContain("never cited");
    expect(addendum).toContain("1, 2");
  });
});

// ---------------------------------------------------------------------------
// 4. Module boundary — both composers share the driver
// ---------------------------------------------------------------------------

describe("composeDigest (default Haiku) — module boundary", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(recordCost).mockClear();
  });

  function modelResponse(text: string) {
    return { text, usage } as unknown as Awaited<
      ReturnType<typeof generateText>
    >;
  }

  it("passes maxTokens 3000 (CAD-219 raised from 2400)", async () => {
    expect(COMPOSER_MAX_OUTPUT_TOKENS).toBe(3000);
    vi.mocked(generateText).mockResolvedValueOnce(
      modelResponse(JSON.stringify(cleanBrief()))
    );
    await composeDigest(composerInput());
    expect(generateText).toHaveBeenCalledTimes(1);
    const args = vi.mocked(generateText).mock.calls[0][0];
    expect(args.maxTokens).toBe(3000);
  });

  it("retries the composer call once on truncation, with the addendum in the system prompt", async () => {
    const truncated = JSON.stringify(cleanBrief()).slice(0, 80);
    vi.mocked(generateText)
      .mockResolvedValueOnce(modelResponse(truncated))
      .mockResolvedValueOnce(modelResponse(JSON.stringify(cleanBrief())));

    const out = await composeDigest(composerInput());

    expect(generateText).toHaveBeenCalledTimes(2);
    const firstSystem = vi.mocked(generateText).mock.calls[0][0]
      .system as string;
    const secondSystem = vi.mocked(generateText).mock.calls[1][0]
      .system as string;
    expect(firstSystem).not.toContain("CORRECTION REQUIRED");
    expect(secondSystem).toContain("CORRECTION REQUIRED");
    expect(secondSystem).toContain(firstSystem); // addendum appended, base prompt intact

    expect(out.repair).toEqual({ composeRetries: 1 });

    // ONE cost row with tokens summed across both attempts.
    expect(recordCost).toHaveBeenCalledTimes(1);
    const cost = vi.mocked(recordCost).mock.calls[0][0];
    expect(cost.inputTokens).toBe(200);
    expect(cost.outputTokens).toBe(100);
  });

  it("throws ComposerJsonError after a failed retry (pipeline fallback unchanged)", async () => {
    const truncated = JSON.stringify(cleanBrief()).slice(0, 80);
    vi.mocked(generateText).mockResolvedValue(modelResponse(truncated));

    await expect(composeDigest(composerInput())).rejects.toThrow(
      ComposerJsonError
    );
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});

describe("composeDigestPro (Sonnet) — same shared behavior", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(recordCost).mockClear();
  });

  it("retries once on missing-source parity, then succeeds", async () => {
    const bad = cleanBrief();
    bad.tldr = "Ghost [7] plus [1].";
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: JSON.stringify(bad), usage } as never)
      .mockResolvedValueOnce({
        text: JSON.stringify(cleanBrief()),
        usage,
      } as never);

    const out = await composeDigestPro(composerInput());

    expect(generateText).toHaveBeenCalledTimes(2);
    const secondSystem = vi.mocked(generateText).mock.calls[1][0]
      .system as string;
    expect(secondSystem).toContain("CORRECTION REQUIRED");
    expect(out.repair).toEqual({ composeRetries: 1 });
    expect(out.inputTokens).toBe(200);
    expect(out.outputTokens).toBe(100);
  });

  it("prunes unused sources deterministically without a retry", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(briefWithUnused()),
      usage,
    } as never);

    const out = await composeDigestPro(composerInput());
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(out.repair).toEqual({ prunedUnused: 2 });
  });
});

// ---------------------------------------------------------------------------
// 4. CAD-224 — failed-spend visibility + retry deadline
// ---------------------------------------------------------------------------

describe("CAD-224 — composeBriefWithRepair failure contract", () => {
  const ctx = { modelId: "test-model", digestRunId: "run-1" };

  it("throws with summed token counts when both attempts fail (#2)", async () => {
    const callModel = vi.fn(async (_addendum?: string) => ({
      text: "not json at all",
      inputTokens: 100,
      outputTokens: 50,
    }));
    let caught: unknown;
    try {
      await composeBriefWithRepair(callModel, ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ComposerJsonError);
    const e = caught as ComposerJsonError;
    // Two attempts × (100 in / 50 out) — the spend a provider must record.
    expect(e.inputTokens).toBe(200);
    expect(e.outputTokens).toBe(100);
  });

  it("skips the corrective retry when past retryDeadlineAtMs (#4)", async () => {
    const callModel = vi.fn(async (_addendum?: string) => ({
      text: "not json at all",
      inputTokens: 100,
      outputTokens: 50,
    }));
    let caught: unknown;
    try {
      await composeBriefWithRepair(callModel, {
        ...ctx,
        retryDeadlineAtMs: Date.now() - 1, // already expired
      });
    } catch (err) {
      caught = err;
    }
    // ONE call only — the retry was skipped, and the error says so while
    // still carrying the first attempt's tokens.
    expect(callModel).toHaveBeenCalledTimes(1);
    const e = caught as ComposerJsonError;
    expect(e).toBeInstanceOf(ComposerJsonError);
    expect(e.message).toContain("compose deadline exceeded");
    expect(e.inputTokens).toBe(100);
    expect(e.outputTokens).toBe(50);
  });

  it("future deadline leaves the retry path unchanged", async () => {
    const callModel = vi.fn(async (addendum?: string) =>
      addendum
        ? { text: JSON.stringify(cleanBrief()), inputTokens: 100, outputTokens: 50 }
        : { text: "garbage", inputTokens: 100, outputTokens: 50 }
    );
    const result = await composeBriefWithRepair(callModel, {
      ...ctx,
      retryDeadlineAtMs: Date.now() + 60_000,
    });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(result.repair?.composeRetries).toBe(1);
  });
});
