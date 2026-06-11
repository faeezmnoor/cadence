/**
 * Brief-creation revamp PR 2 — pure tests for the TEMPLATE SEED system
 * overlay (server/ai/config-agent/template-seed.ts). The LLM-in-the-loop
 * contract check lives in test/eval-template-live.test.ts (env-gated).
 */
import { describe, expect, it } from "vitest";
import {
  buildTemplateSeedBlock,
  MAX_SEED_TURN,
  TEMPLATE_REPLY_CONTRACT,
} from "@/server/ai/config-agent/template-seed";
import { VISIBLE_TEMPLATES } from "@/lib/digest-spec/templates";

describe("buildTemplateSeedBlock", () => {
  it("returns empty for freehand threads (no templateId)", () => {
    expect(buildTemplateSeedBlock({ templateId: null, turnIdx: 1 })).toBe("");
    expect(buildTemplateSeedBlock({ templateId: undefined, turnIdx: 1 })).toBe("");
  });

  it("returns empty for unknown template ids (tampered/removed)", () => {
    expect(
      buildTemplateSeedBlock({ templateId: "nonexistent", turnIdx: 1 })
    ).toBe("");
  });

  it("stops seeding after the second exchange (prompt-noise guard)", () => {
    const live = buildTemplateSeedBlock({
      templateId: "palm_oil_mpob",
      turnIdx: MAX_SEED_TURN,
    });
    const late = buildTemplateSeedBlock({
      templateId: "palm_oil_mpob",
      turnIdx: MAX_SEED_TURN + 1,
    });
    expect(live).not.toBe("");
    expect(late).toBe("");
  });

  it("carries label, seed hints JSON, contract, and forking question", () => {
    const block = buildTemplateSeedBlock({
      templateId: "palm_oil_mpob",
      turnIdx: 1,
    });
    expect(block).toContain('"Palm oil market brief" card (palm_oil_mpob)');
    expect(block).toContain('"frequency": "daily"');
    // Confirm-don't-assume is the load-bearing instruction.
    expect(block).toContain("do NOT write these to the spec");
    expect(block).toContain(TEMPLATE_REPLY_CONTRACT);
    expect(block).toContain("Do you produce, trade or buy palm oil?");
  });

  it("renders a complete block for every visible template", () => {
    for (const tpl of VISIBLE_TEMPLATES) {
      const block = buildTemplateSeedBlock({ templateId: tpl.id, turnIdx: 1 });
      expect(block, tpl.id).toContain(tpl.label);
      expect(block, tpl.id).toContain(TEMPLATE_REPLY_CONTRACT);
      expect(block, tpl.id).toContain(tpl.forkingQuestion!);
    }
  });

  it("contract pins one-question-per-reply and the 3-question budget", () => {
    expect(TEMPLATE_REPLY_CONTRACT).toContain("exactly ONE question");
    expect(TEMPLATE_REPLY_CONTRACT).toContain("3 questions total");
    expect(TEMPLATE_REPLY_CONTRACT).toContain("Never re-ask the topic or the schedule");
  });
});
