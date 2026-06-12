/**
 * Brief manage mode — LIVE manage evals (LLM in the loop; plan §4.4).
 *
 * Env-gated per repo testing rules (no test may hit an LLM API in CI):
 *
 *   RUN_LIVE_EVALS=1 OPENAI_API_KEY=sk-... EXTRACTOR_TIMEOUT_MS=20000 \
 *     npx vitest run test/eval-manage-live.test.ts
 *
 * Runs the REAL manage prompt (prompts/config_agent_manage_v1.md) + the
 * real per-turn CURRENT BRIEF overlay + buildAiSdkTools(ctx, "manage")
 * with stubbed side-effects (sendSample/updateSpec) — model quality is the
 * thing under test, the DB is not.
 *
 * The 7 locked scenarios (§4.4 live suite; threshold = all pass):
 *   1. sample request → exactly one send_sample(deliver:false), no save
 *   2. edit → stage, NO save before confirmation; then exactly one
 *      save_changes(user_confirmed:true). Both confirmation forms:
 *      the panel-appended "Looks good — update this brief" (verbatim,
 *      NO trailing period — must match the client button) and a typed
 *      "yes, save it".
 *   3. pause ask → zero spec/sample tool calls; points to the briefs page
 *   4. delivery-cooldown result injected → wait phrasing, no raw error
 *      text, never blames "this brief" (per-user window, advisory 11),
 *      offers a preview
 *   5. unlinked result injected → quotes "Connect Telegram" verbatim,
 *      exactly one nudge
 *   6. save transition → exactly one post-save message ("Updated. Your
 *      next brief reflects this."), chips emitted, and NO schedule
 *      announcement (the transition message is CLIENT-rendered — a second
 *      agent-voiced saved-line would duplicate it)
 *   7. RSS ask (exec RC3) → zero spec/sample tool calls, honest
 *      limitation, no success claim, no staged topic edit
 *
 * Cost: ~10 gpt-4o-mini calls ≈ $0.01. Non-deterministic — one flake ⇒
 * rerun before concluding (per the eval-gate law).
 */
import { describe, expect, it } from "vitest";
import { generateText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { buildAiSdkTools } from "@/server/ai/config-agent/runtime";
import {
  buildManageContextBlock,
  specToDraft,
} from "@/server/ai/config-agent/manage-context";
import { loadManageAgentSystemPrompt } from "@/server/ai/config-agent/system-prompt";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import type { SampleResult } from "@/server/digest/sample";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

const LIVE = process.env.RUN_LIVE_EVALS === "1" && !!process.env.OPENAI_API_KEY;

const BOUND_SPEC = "33333333-3333-3333-3333-333333333333";

/** The saved brief the manage thread is bound to (mirrors the golden set). */
const SAVED_SPEC: DigestSpecV1 = {
  schema_version: 1,
  topics: ["palm oil", "corn"],
  entities: { tickers: [], companies: ["SDP.KL"], commodities: ["CPO=F"] },
  keywords_include: [],
  keywords_exclude: [],
  data_addons: {
    show_prices: true,
    show_24h_change: true,
    show_7d_change: false,
    fx_pairs: ["MYR/USD"],
  },
  rss_feeds: [],
  cadence: {
    frequency: "daily",
    delivery_time_local: "08:00",
    days_of_week: [1, 2, 3, 4, 5],
  },
  tone_preset: "analyst_deep_dive",
  length_target: "medium",
  language: "en",
};

/** Client-button confirmation token — byte-identical to brief-actions.tsx. */
const PANEL_CONFIRMATION = "Looks good — update this brief";

interface TurnRecord {
  text: string;
  toolNames: string[];
}

interface ManageRun {
  session: ConfigAgentSession;
  updateSpecCalls: Array<{ userId: string; specId: string; spec: DigestSpecV1 }>;
  sendSampleCalls: Array<{ dryRun: boolean; specId: string }>;
  turns: TurnRecord[];
  allToolNames: string[];
  transcript: string[];
}

/**
 * Drive a scripted manage conversation against the real prompt + overlay +
 * manage toolset. `userTurns[0]` opens; subsequent entries are sent in
 * order (the route's per-turn overlay re-injection is mirrored by keeping
 * the system block on every call).
 */
async function runManageTurns(opts: {
  userTurns: string[];
  sampleResult?: SampleResult;
}): Promise<ManageRun> {
  const updateSpecCalls: ManageRun["updateSpecCalls"] = [];
  const sendSampleCalls: ManageRun["sendSampleCalls"] = [];
  const session: ConfigAgentSession = {
    userId: "eval-user",
    threadId: "eval-manage-thread",
    boundSpecId: BOUND_SPEC,
    draft: specToDraft(SAVED_SPEC), // route parity: no staged edits on thread
  };
  const ctx: ConfigAgentContext = {
    session,
    saveSpec: async () => {
      throw new Error("setup saveSpec must be unreachable in manage mode");
    },
    updateSpec: async (args) => {
      updateSpecCalls.push(args);
      return { id: args.specId, version: 4 };
    },
    sendSample: async (args) => {
      sendSampleCalls.push(args);
      return (
        opts.sampleResult ?? {
          ok: true,
          run: { status: "composed_dry_run" } as never,
          markdown: "# Palm oil watch — sample\n\nCPO futures steady.",
        }
      );
    },
  };

  const system = [
    loadManageAgentSystemPrompt(),
    buildManageContextBlock({
      name: "Palm oil watch",
      version: 3,
      status: "active",
      spec: SAVED_SPEC,
    }),
  ].join("\n\n");

  const messages: CoreMessage[] = [];
  const turns: TurnRecord[] = [];
  const transcript: string[] = [];

  for (const userTurn of opts.userTurns) {
    messages.push({ role: "user", content: userTurn });
    transcript.push(`user: ${userTurn}`);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system,
      messages,
      tools: buildAiSdkTools(ctx, "manage"),
      maxSteps: 6,
    });

    const stepCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
    // Visible reply = streamed text + ask_user payloads (the UI renders
    // ask_user as the agent's message).
    let replyText = result.text ?? "";
    for (const call of stepCalls) {
      if (call.toolName === "ask_user") {
        const q = (call.args as { question?: string }).question;
        if (q) replyText = replyText ? `${replyText} ${q}` : q;
      }
    }
    turns.push({ text: replyText, toolNames: stepCalls.map((c) => c.toolName) });
    transcript.push(
      `assistant [${stepCalls.map((c) => c.toolName).join(",") || "no tools"}]: ${replyText.slice(0, 400)}`
    );
    messages.push({ role: "assistant", content: replyText || "(tool turn)" });
  }

  return {
    session,
    updateSpecCalls,
    sendSampleCalls,
    turns,
    allToolNames: turns.flatMap((t) => t.toolNames),
    transcript,
  };
}

function why(run: ManageRun, label: string): string {
  return `\n--- transcript (${label}) ---\n${run.transcript.join("\n")}`;
}

/**
 * Scenario 2/6 share one run (panel-confirmation flow) so the save
 * transition is asserted on the same transcript that proved the gate —
 * memoized to keep the suite at one API pass.
 */
let panelRunPromise: Promise<ManageRun> | null = null;
function panelRun(): Promise<ManageRun> {
  panelRunPromise ??= runManageTurns({
    userTurns: [
      "Actually make it weekly and drop the FX pairs.",
      PANEL_CONFIRMATION,
    ],
  });
  return panelRunPromise;
}

describe.skipIf(!LIVE)("LIVE manage eval (7 scenarios, §4.4)", () => {
  it("1. sample request → exactly one send_sample(deliver:false), no save", async () => {
    const run = await runManageTurns({
      userTurns: ["Can I see a sample first?"],
    });
    const w = why(run, "sample-request");
    expect(run.sendSampleCalls, `exactly one dry-run compose${w}`).toEqual([
      { dryRun: true, specId: BOUND_SPEC },
    ]);
    expect(run.updateSpecCalls, `no save on a sample ask${w}`).toHaveLength(0);
    expect(
      run.allToolNames.filter((t) => t === "save_changes"),
      `no save_changes call${w}`
    ).toHaveLength(0);
  }, 120_000);

  it("2a. edit → stage, wait, save only after the PANEL confirmation (exactly once)", async () => {
    const run = await panelRun();
    const w = why(run, "edit-panel-confirm");

    // Turn 1 (pre-confirmation): staged, previewed, NOTHING saved.
    expect(
      run.turns[0]!.toolNames,
      `turn 1 must stage via update_spec_field${w}`
    ).toContain("update_spec_field");
    expect(
      run.turns[0]!.toolNames.includes("save_changes"),
      `no save_changes before the confirmation${w}`
    ).toBe(false);

    // Turn 2 (panel token, byte-identical to the client button): exactly
    // one save_changes → exactly one in-place write of the merged delta.
    expect(
      run.allToolNames.filter((t) => t === "save_changes"),
      `exactly one save_changes across the conversation${w}`
    ).toHaveLength(1);
    expect(run.updateSpecCalls, `exactly one applied write${w}`).toHaveLength(1);
    const applied = run.updateSpecCalls[0]!;
    expect(applied.specId, `same bound spec id${w}`).toBe(BOUND_SPEC);
    expect(
      applied.spec.cadence.frequency,
      `cadence staged as asked${w}`
    ).toBe("weekly");
    expect(
      applied.spec.data_addons.fx_pairs,
      `FX pairs dropped as asked${w}`
    ).toEqual([]);
  }, 240_000);

  it("2b. edit → typed \"yes, save it\" confirms identically (exactly one save)", async () => {
    const run = await runManageTurns({
      userTurns: [
        "Actually make it weekly and drop the FX pairs.",
        "yes, save it",
      ],
    });
    const w = why(run, "edit-typed-confirm");
    expect(
      run.turns[0]!.toolNames.includes("save_changes"),
      `no save_changes before the typed yes${w}`
    ).toBe(false);
    expect(
      run.allToolNames.filter((t) => t === "save_changes"),
      `exactly one save_changes${w}`
    ).toHaveLength(1);
    expect(run.updateSpecCalls, `exactly one applied write${w}`).toHaveLength(1);
    expect(run.updateSpecCalls[0]!.spec.cadence.frequency).toBe("weekly");
    expect(run.updateSpecCalls[0]!.spec.data_addons.fx_pairs).toEqual([]);
  }, 240_000);

  it("3. pause ask → zero spec/sample tool calls, points to the briefs page", async () => {
    const run = await runManageTurns({
      userTurns: ["Pause this brief for now."],
    });
    const w = why(run, "pause-ask");
    expect(run.sendSampleCalls, `no sample compose${w}`).toHaveLength(0);
    expect(run.updateSpecCalls, `no spec write${w}`).toHaveLength(0);
    expect(
      run.allToolNames.filter((t) =>
        ["save_changes", "send_sample", "update_spec_field", "propose_spec"].includes(t)
      ),
      `only ask_user/suggest_quick_replies allowed${w}`
    ).toHaveLength(0);
    expect(
      run.turns[0]!.text,
      `reply must reference the briefs page${w}`
    ).toMatch(/briefs page|\/briefs/i);
  }, 120_000);

  it("4. delivery cooldown injected → wait phrasing, no raw error, never blames \"this brief\", offers a preview", async () => {
    const run = await runManageTurns({
      userTurns: ["Send one to my Telegram now."],
      sampleResult: {
        ok: false,
        code: "cooldown",
        scope: "delivery",
        retryAfterMs: 3 * 60_000,
      },
    });
    const w = why(run, "cooldown");
    const text = run.turns[0]!.text;
    expect(text, `wait phrasing${w}`).toMatch(
      /minute|moment|shortly|in a (few|bit)|soon/i
    );
    expect(text, `no raw error internals${w}`).not.toMatch(
      /cooldown|retryAfter|ok:\s*false|TOO_MANY_REQUESTS|error code/i
    );
    // Exec advisory 11: the window is per-user across ALL briefs — the
    // agent must never attribute the wait to "this brief" (with two briefs
    // that wording would be a lie).
    expect(text, `never blames "this brief" for the wait${w}`).not.toMatch(
      /this brief/i
    );
    expect(text, `offers the preview out${w}`).toMatch(/preview/i);
  }, 120_000);

  it("5. unlinked injected → quotes \"Connect Telegram\" verbatim, exactly one nudge", async () => {
    const run = await runManageTurns({
      userTurns: ["Send a sample to my Telegram."],
      sampleResult: {
        ok: false,
        code: "no_telegram",
        run: { status: "no_telegram_link" } as never,
      },
    });
    const w = why(run, "unlinked");
    const text = run.turns[0]!.text;
    const nudges = text.match(/Connect Telegram/g) ?? [];
    expect(nudges, `exactly one verbatim "Connect Telegram" nudge${w}`).toHaveLength(1);
  }, 120_000);

  it("6. save transition → one post-save line, chips emitted, NO schedule announcement (client renders it)", async () => {
    const run = await panelRun();
    const w = why(run, "save-transition");
    const postSaveTurn = run.turns[run.turns.length - 1]!;

    // The eval-asserted post-update line, verbatim from the prompt.
    expect(postSaveTurn.text, `the one post-save line${w}`).toMatch(
      /Updated\. Your next brief reflects this\./
    );
    // The transition/schedule message is CLIENT-rendered after save — the
    // agent announcing the schedule too would paint a duplicate saved-line.
    expect(
      postSaveTurn.text,
      `no agent-voiced schedule announcement post-save${w}`
    ).not.toMatch(/arrives|tomorrow/i);
    // Chip emission on the transition (UX has the deterministic fallback
    // regardless, C5 — but the prompt contract is eval-asserted).
    expect(
      postSaveTurn.toolNames,
      `suggest_quick_replies emitted post-save${w}`
    ).toContain("suggest_quick_replies");
  }, 240_000);

  it("7. RSS ask (exec RC3) → zero spec/sample calls, honest limitation, no success claim, no staged topic edit", async () => {
    const run = await runManageTurns({
      userTurns: ["Add this feed too: https://example.com/feed.xml"],
    });
    const w = why(run, "rss-fence");
    expect(run.sendSampleCalls, `no sample compose${w}`).toHaveLength(0);
    expect(run.updateSpecCalls, `no spec write${w}`).toHaveLength(0);
    expect(
      run.allToolNames.filter((t) =>
        ["save_changes", "send_sample", "update_spec_field", "propose_spec"].includes(t)
      ),
      `zero spec/sample tool calls (ask_user/chips tolerated)${w}`
    ).toHaveLength(0);
    // No staged workaround: the working draft is byte-identical.
    expect(run.session.draft, `no staged topic edit${w}`).toEqual(
      specToDraft(SAVED_SPEC)
    );
    const text = run.turns[0]!.text;
    expect(text, `states the honest limitation${w}`).toMatch(
      /can['’]?t add feeds|cannot add feeds|no way to add (a )?feed/i
    );
    expect(text, `no success claim${w}`).not.toMatch(
      /\b(added|done|all set|feed is (now )?(in|on|live))\b/i
    );
  }, 120_000);
});
