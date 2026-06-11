/**
 * Brief-creation revamp PR 2 — LIVE template evals (LLM in the loop).
 *
 * Two suites, both env-gated per repo testing rules (no test may hit an
 * LLM API in CI — this file is skipped unless explicitly armed):
 *
 *   RUN_LIVE_EVALS=1 OPENAI_API_KEY=sk-... npx vitest run test/eval-template-live.test.ts
 *
 *  A. Extraction golden set — every visible template's exampleQuery must
 *     yield the slots the card promised (topic present, frequency matches
 *     seedHints.cadence). A template copy edit that breaks extraction
 *     fails here before it ships.
 *
 *  B. Interview contract — for each STARTER template, simulate the
 *     post-tap conversation against the real system prompt + template-seed
 *     overlay + real tool bridge (stubbed saveSpec):
 *       - the agent's first reply asks at most ONE question,
 *       - the brief is saved within 3 scripted user turns,
 *       - total questions asked ≤ 3.
 *     This is the merge gate for PR 3 (gallery) per the proposal §6.
 *
 * Cost: ~10-15 gpt-4o-mini calls per run (≈ $0.01). Non-deterministic by
 * nature — a single flake on suite B means rerun before concluding.
 */
import { describe, expect, it } from "vitest";
import { generateText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  STARTER_TEMPLATES,
  VISIBLE_TEMPLATES,
  type DigestTemplate,
} from "@/lib/digest-spec/templates";
import { extractSlots } from "@/server/ai/config-agent/extract";
import { buildAiSdkTools } from "@/server/ai/config-agent/runtime";
import { buildTemplateSeedBlock } from "@/server/ai/config-agent/template-seed";
import { loadConfigAgentSystemPrompt } from "@/server/ai/config-agent/system-prompt";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

const LIVE = process.env.RUN_LIVE_EVALS === "1" && !!process.env.OPENAI_API_KEY;

/** Scripted answers to each starter's forking question. */
const FORK_ANSWERS: Record<string, string> = {
  palm_oil_mpob: "I buy palm oil for my feed mill in Johor.",
  lhdn_circulars: "I advise clients — solo tax practice in KL.",
  competitor_watch: "Watch Acme Software, BetaWorks and Cloudly.",
};

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

describe.skipIf(!LIVE)("LIVE eval A — extraction golden set", () => {
  for (const tpl of VISIBLE_TEMPLATES) {
    it(`${tpl.id}: exampleQuery yields topic + promised frequency`, async () => {
      const result = await extractSlots({
        latestUserMessage: tpl.exampleQuery,
        draft: undefined,
        recentTurns: [],
      });
      expect(result.status, `extractor status for ${tpl.id}`).toBe("ok");
      const slots = result.slots;
      const hasTopic =
        (slots.topics?.value?.length ?? 0) > 0 || !!slots.industry?.value;
      expect(hasTopic, `${tpl.id}: no topic extracted`).toBe(true);
      const promised = tpl.seedHints?.cadence?.frequency;
      expect(
        slots.frequency?.value,
        `${tpl.id}: frequency should extract as "${promised}"`
      ).toBe(promised);
    }, 30_000);
  }
});

describe.skipIf(!LIVE)("LIVE eval B — post-tap interview contract", () => {
  async function runInterview(tpl: DigestTemplate): Promise<{
    saved: DigestSpecV1[];
    totalQuestions: number;
    firstReplyQuestions: number;
    transcript: string[];
  }> {
    const saved: DigestSpecV1[] = [];
    const session: ConfigAgentSession = {
      userId: "eval-user",
      threadId: "eval-thread",
    };
    const ctx: ConfigAgentContext = {
      session,
      saveSpec: async ({ spec }) => {
        saved.push(spec);
        return { id: "eval-spec-1", version: saved.length };
      },
    };

    const messages: CoreMessage[] = [
      { role: "user", content: tpl.exampleQuery },
    ];
    const userTurns = [
      FORK_ANSWERS[tpl.id] ?? "Whatever you think fits best.",
      "Yes, that's right — save it.",
      "Yes, save it.",
    ];

    let totalQuestions = 0;
    let firstReplyQuestions = -1;
    const transcript: string[] = [`user: ${tpl.exampleQuery}`];

    for (let turn = 0; turn < 4 && saved.length === 0; turn++) {
      // turnIdx mirrors the route: persisted-message count including the
      // current user message (1, 3, 5, ...).
      const turnIdx = turn * 2 + 1;
      const seed = buildTemplateSeedBlock({ templateId: tpl.id, turnIdx });
      const system = [loadConfigAgentSystemPrompt(), seed]
        .filter(Boolean)
        .join("\n\n");

      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system,
        messages,
        tools: buildAiSdkTools(ctx),
        maxSteps: 6,
      });

      // Question accounting: visible text + any ask_user tool questions.
      let replyText = result.text ?? "";
      for (const call of result.toolCalls ?? []) {
        if (call.toolName === "ask_user") {
          const q = (call.args as { question?: string }).question;
          if (q) replyText += ` ${q}`;
        }
      }
      const q = countQuestions(replyText);
      totalQuestions += q;
      if (firstReplyQuestions < 0) firstReplyQuestions = q;
      transcript.push(`assistant: ${replyText.slice(0, 300)}`);

      if (saved.length > 0) break;
      const nextUser = userTurns[turn] ?? "Yes, save it.";
      messages.push({ role: "assistant", content: replyText || "(tool turn)" });
      messages.push({ role: "user", content: nextUser });
      transcript.push(`user: ${nextUser}`);
    }

    return { saved, totalQuestions, firstReplyQuestions, transcript };
  }

  for (const tpl of STARTER_TEMPLATES) {
    it(`${tpl.id}: confirms, asks one question, saves within 3 turns`, async () => {
      const run = await runInterview(tpl);
      const why = `\n--- transcript (${tpl.id}) ---\n${run.transcript.join("\n")}`;
      expect(run.firstReplyQuestions, `first reply must ask ≤1 question${why}`)
        .toBeLessThanOrEqual(1);
      expect(run.saved.length, `brief must be saved within 3 user turns${why}`)
        .toBe(1);
      expect(run.totalQuestions, `≤3 questions total${why}`).toBeLessThanOrEqual(3);
    }, 120_000);
  }
});
