/**
 * POST /api/chat
 *
 * The streaming endpoint Vercel AI SDK `useChat` posts to. Per-turn flow:
 *
 *  1. Auth — Supabase user must own the threadId.
 *  2. Load prior persisted messages from chat_messages and prepend to the
 *     incoming `messages` array (the client only sends the visible UI
 *     messages; we re-hydrate full context here for trust + cost reasons).
 *     Actually: useChat is configured with `initialMessages` from
 *     listMessages, so it always sends the full thread. We just persist
 *     and validate.
 *  3. Persist the latest user message (last entry in `messages`).
 *  4. Build the ConfigAgentContext, wire descriptor tools via the AI SDK
 *     bridge, call streamText with the system prompt + history.
 *  5. On finish, persist the assistant turn (text + tool calls/results).
 *
 * Streaming uses `result.toDataStreamResponse()` which `useChat` understands.
 *
 * Cost control: maxSteps=6 so the agent can't run away with tool calls.
 */
import { openai } from "@ai-sdk/openai";
import { streamText, type Message } from "ai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads, digestSpecs } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isManageMode } from "@/lib/feature-flags";
import { resolveThreadGate } from "@/server/chat/thread-gate";
import { capManageTranscript } from "@/server/chat/manage-transcript";
import { buildAiSdkTools } from "@/server/ai/config-agent/runtime";
import { saveSpecForUser } from "@/server/ai/config-agent/save-spec";
import { updateSpecInPlace } from "@/server/ai/config-agent/update-spec";
import { runSampleForUser } from "@/server/digest/sample";
import {
  buildManageContextBlock,
  specToDraft,
} from "@/server/ai/config-agent/manage-context";
import {
  loadConfigAgentSystemPrompt,
  loadManageAgentSystemPrompt,
} from "@/server/ai/config-agent/system-prompt";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import {
  digestSpecDraftSchema,
  type DigestSpecDraft,
} from "@/lib/digest-spec/schema";
import { log } from "@/lib/log";
import {
  detectMultiTopicIntake,
  MULTI_TOPIC_REFUSAL,
} from "@/lib/chat/multi-topic";
import { isKnownTemplateId } from "@/lib/digest-spec/templates";
import { checkRateLimit } from "@/server/rate-limit/check";
import {
  recordChatTurn,
  recordExtractionEvent,
} from "@/server/chat/telemetry";
import { openaiCostUsd, recordCost } from "@/server/cost/record";
import { extractSlots } from "@/server/ai/config-agent/extract";
import { stripQuickReplyLeak } from "@/lib/chat/sanitize";
import {
  mergeExtractedSlots,
  type AppliedSlots,
} from "@/server/ai/config-agent/slot-merge";
import { buildPriorContextBlock } from "@/server/ai/config-agent/prior-context";
import { buildTemplateSeedBlock } from "@/server/ai/config-agent/template-seed";
import { count } from "drizzle-orm";

const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_SECONDS = 60;

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequestBody {
  threadId: string;
  messages: Message[];
  /**
   * Brief-creation revamp PR 1: set when the latest user message was
   * auto-submitted by a template card / deep-link rather than typed.
   * Validated against the catalog; stamped once on chat_threads.template_id
   * (migration 0026). NULL/absent = freehand.
   */
  templateId?: string;
  templateSource?: string;
}

const TEMPLATE_SOURCES = new Set(["starter_card", "gallery", "deep_link"]);

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Security HIGH #2: per-user rate limit to bound LLM cost runaway. A
  // stolen session or a misbehaving client can otherwise loop streamText
  // and burn real Anthropic dollars in minutes. 5 turns/min is well above
  // any honest typing cadence but well below sustained abuse.
  const rl = await checkRateLimit({
    userId: user.id,
    scope: "chat_turn",
    limit: CHAT_RATE_LIMIT,
    windowSeconds: CHAT_RATE_WINDOW_SECONDS,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        retryAfter: rl.retryAfter,
        message: `You're sending messages too fast. Try again in ${rl.retryAfter}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfter) },
      }
    );
  }

  const body = (await req.json().catch(() => null)) as ChatRequestBody | null;
  if (!body?.threadId || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Verify thread ownership.
  const threadRows = await db
    .select()
    .from(chatThreads)
    .where(
      and(eq(chatThreads.id, body.threadId), eq(chatThreads.userId, user.id))
    )
    .limit(1);
  const thread = threadRows[0];
  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  // Manage mode (plan §4.2): gate + mode derivation via the pure helper.
  // The bound spec row is loaded only when the thread is spec-bound AND the
  // flag is on (flag-off spec-bound threads fail closed without a spec read
  // — exec RC5). The ownership filter on the spec query matters: a thread
  // bound to someone else's spec (impossible today, defensive forever)
  // reads as "missing" and fails closed as brief_archived.
  const manageOn = isManageMode();
  let boundSpec:
    | {
        id: string;
        status: string;
        name: string;
        version: number;
        spec: unknown;
      }
    | null = null;
  if (manageOn && thread.specId != null) {
    const specRows = await db
      .select({
        id: digestSpecs.id,
        status: digestSpecs.status,
        name: digestSpecs.name,
        version: digestSpecs.version,
        spec: digestSpecs.spec,
      })
      .from(digestSpecs)
      .where(
        and(eq(digestSpecs.id, thread.specId), eq(digestSpecs.userId, user.id))
      )
      .limit(1);
    boundSpec = specRows[0] ?? null;
  }
  const gate = resolveThreadGate({
    manageMode: manageOn,
    thread: { status: thread.status, specId: thread.specId },
    spec: boundSpec,
  });
  if (!gate.ok) {
    if (gate.reason === "brief_archived") {
      // AC8.1 / C3: server backstop for archived briefs — the client swaps
      // to the archived banner state on this envelope; never a stale success.
      return NextResponse.json(
        {
          error: "brief_archived",
          message:
            "This brief is archived, so this chat is closed. Your conversation is kept here.",
        },
        { status: 409 }
      );
    }
    // not_active AND flag_off_spec_bound share the legacy generic envelope
    // (exec RC5 asks for a generic 409; clients already handle this shape).
    return NextResponse.json(
      { error: "thread is not active" },
      { status: 409 }
    );
  }
  const mode = gate.mode;

  // Persist the latest user message (the one the client just sent).
  const lastMsg = body.messages[body.messages.length - 1];
  let lastUserText = "";
  if (lastMsg?.role === "user") {
    // Guard: ai-sdk message.content can be string OR a parts array. Coerce
    // to string so persistence never throws on non-string payloads (e.g.
    // multi-modal parts from a future client). Stringifying preserves the
    // raw shape for debugging while keeping the column type stable.
    const text =
      typeof lastMsg.content === "string"
        ? lastMsg.content
        : JSON.stringify(lastMsg.content ?? "");
    lastUserText = text;
    await db.insert(chatMessages).values({
      threadId: thread.id,
      role: "user",
      content: { kind: "user_text", text },
    });
    // Wave 3 (CAD-181): funnel telemetry — best-effort.
    void recordChatTurn({
      userId: user.id,
      threadId: thread.id,
      role: "user",
      charCount: text.length,
    });

    // Manage mode (exec advisory 10): touch updatedAt on the user-message
    // insert, not only in onFinish — an aborted stream must still update
    // bare-/chat recency (resolution orders manage threads by updatedAt).
    await db
      .update(chatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(chatThreads.id, thread.id));

    // Brief-creation revamp PR 1: template provenance. Stamp once — the
    // first template submission wins; later taps in the same thread don't
    // overwrite, so freehand-vs-template share stays honest. Unknown ids
    // (tampered client, removed template) are dropped, not errored — the
    // message itself is still a valid user turn.
    if (
      typeof body.templateId === "string" &&
      thread.templateId == null &&
      isKnownTemplateId(body.templateId)
    ) {
      const source = TEMPLATE_SOURCES.has(body.templateSource ?? "")
        ? (body.templateSource as string)
        : "unknown";
      await db
        .update(chatThreads)
        .set({ templateId: body.templateId, updatedAt: new Date() })
        .where(eq(chatThreads.id, thread.id));
      thread.templateId = body.templateId;
      // next-axiom's Logger has no `event` method — use the repo-wide
      // `log.info("message", fields)` convention (see lib/log.ts usage).
      log.info("template_selected", {
        templateId: body.templateId,
        source,
        threadId: thread.id,
        userId: user.id,
      });
    }
  }

  // QA P1 #4: server-side mirror of the multi-topic refusal. The client
  // intercepts before submit, but non-browser callers (curl, future API
  // clients, a buggy/tampered client) would otherwise hit the LLM directly
  // and let three topics fold into one spec. Mirror the same heuristic
  // here and short-circuit with a persisted assistant refusal turn — no
  // streamText call, no LLM cost.
  //
  // Dogfood 2026-06-11: gated to the INTAKE turn via the shared
  // `detectMultiTopicIntake` wrapper — past the first user message the
  // agent solicits comma-separated lists by design ("Name 2-5 companies"),
  // and refusing those answers blocked the happy path. The gate count
  // comes from persisted rows (authoritative), not the client-supplied
  // `body.messages`, because this mirror exists for tampered clients.
  //
  // Manage mode (plan §4.3.4): SKIPPED entirely — it's intake-tuned, and a
  // manage thread has no intake turn ("drop corn and add soybeans" is an
  // edit, not topic scope-creep).
  if (mode === "setup" && lastMsg?.role === "user") {
    // The current message was inserted above, so >1 row = prior turns.
    // archivedAt filter: today messages are only archived via resetThread
    // (which also archives the thread, and non-active threads 409 above),
    // but don't let the gate depend on that cross-module invariant.
    const userRows = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadId, thread.id),
          eq(chatMessages.role, "user"),
          isNull(chatMessages.archivedAt)
        )
      )
      .limit(2);
    const priorUserTurns = Math.max(0, userRows.length - 1);
    const detection = detectMultiTopicIntake(lastUserText, priorUserTurns);
    if (detection.multiTopic) {
      await db.insert(chatMessages).values({
        threadId: thread.id,
        role: "assistant",
        content: {
          kind: "assistant_turn",
          text: MULTI_TOPIC_REFUSAL,
          toolResults: [],
          multiTopicRefusal: true,
          candidates: detection.candidates,
        },
      });
      return NextResponse.json(
        {
          error: "multi_topic_refused",
          message: MULTI_TOPIC_REFUSAL,
          candidates: detection.candidates,
        },
        { status: 422 }
      );
    }
  }

  // T-408 / CAD-70: rehydrate the working draft from chat_threads.draft_spec
  // so multi-turn edits compose. Validate against the draft schema before
  // trusting it — a malformed row (e.g. from an older schema version) should
  // degrade to an empty draft rather than poisoning the agent.
  let hydratedDraft: DigestSpecDraft | undefined;
  if (thread.draftSpec !== null && thread.draftSpec !== undefined) {
    const parsed = digestSpecDraftSchema.safeParse(thread.draftSpec);
    if (parsed.success) {
      hydratedDraft = parsed.data;
    } else {
      log.warn("chat: discarding malformed draft_spec on thread", {
        threadId: thread.id,
        issues: parsed.error.issues.length,
      });
    }
  }

  // Manage mode (plan §4.3.4): with no staged edits on the thread, seed the
  // working draft from the SAVED spec so update_spec_field patches layer
  // onto reality. Staged edits (thread.draftSpec) survive reload and win.
  if (mode === "manage" && hydratedDraft === undefined && boundSpec) {
    hydratedDraft = specToDraft(boundSpec.spec);
  }

  // Wave 3 / CAD-182: per-turn slot extraction. Runs in parallel with any
  // other prep work; soft-timeout at 2s; empty slots on error so the rest
  // of the pipeline degrades to the pre-Wave-3 flow.
  //
  // Manage mode (plan §4.3.4): extractSlots, slot-merge, and the
  // template-seed overlay are SKIPPED — they're intake-tuned; running them
  // here would pollute spec_extraction_event telemetry and the extractor
  // eval baseline.
  let mergedDraft = hydratedDraft;
  let proposedSlots: AppliedSlots = {};
  let appliedSlots: AppliedSlots = {};
  // Hoisted: also drives the template-seed overlay below (PR 2).
  let turnIdx = 0;
  if (mode === "setup" && lastUserText) {
    // Build the last-4 turns context for the extractor.
    const recent = body.messages.slice(-5, -1).map((m) => ({
      role: m.role,
      text:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));
    const turnIdxRow = await db
      .select({ n: count() })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, thread.id));
    turnIdx = (turnIdxRow[0]?.n ?? 0) as number;

    const extract = await extractSlots({
      latestUserMessage: lastUserText,
      draft: hydratedDraft,
      recentTurns: recent,
    });
    const merge = mergeExtractedSlots(hydratedDraft, extract.slots);
    mergedDraft = merge.draft;
    appliedSlots = merge.applied;
    proposedSlots = merge.proposed;

    void recordExtractionEvent({
      userId: user.id,
      threadId: thread.id,
      turnIdx,
      rawExtracted: extract.slots,
      appliedSlots: merge.applied,
      proposedSlots: merge.proposed,
      droppedSlots: merge.dropped,
      latencyMs: extract.latencyMs,
      status: extract.status,
      error: extract.error,
    });
  }

  const session: ConfigAgentSession = {
    userId: user.id,
    threadId: thread.id,
    draft: mergedDraft,
    // Manage mode: the bound spec id is SERVER-derived from the thread row.
    boundSpecId: mode === "manage" ? thread.specId ?? undefined : undefined,
  };
  // TRUST NOTE (exec advisory 8): body.messages is client-supplied model
  // history (pre-existing posture, see the file header). Manage-mode WRITES
  // never derive from it — save_changes applies only the server-hydrated
  // session.draft (thread.draftSpec / saved spec), targets only the
  // server-derived boundSpecId, and the user_confirmed + draft-exists gates
  // bound any model lapse to "nothing saved".
  const agentCtx: ConfigAgentContext = {
    session,
    // Brief-creation revamp PR 1: carry the thread's template provenance
    // onto the saved spec row (digest_specs.template_id, migration 0026)
    // without widening the tool-facing saveSpec contract.
    saveSpec: (args) =>
      saveSpecForUser({ ...args, templateId: thread.templateId ?? null }),
    // Manage mode (plan §4.3.3): injected side-effects, wired to the
    // in-place updater (zero cap interaction) and the shared sample core
    // (chat_tool origin → 60s dry-run throttle, typed results).
    ...(mode === "manage"
      ? {
          updateSpec: updateSpecInPlace,
          sendSample: (args: { dryRun: boolean; specId: string }) =>
            runSampleForUser({
              userId: user.id,
              dryRun: args.dryRun,
              origin: "chat_tool",
              specId: args.specId,
            }),
        }
      : {}),
  };

  // PRIOR CONTEXT block: if anything was applied or proposed this turn,
  // inject a short system addendum so the agent doesn't re-ask filled
  // slots and frames a confirm-style follow-up on proposals. The base
  // prompt stays canonical on disk — this is a per-turn overlay.
  const priorCtxBlock = buildPriorContextBlock(mergedDraft, appliedSlots, proposedSlots);
  // TEMPLATE SEED block (PR 2): when the thread started from a catalog
  // card, overlay the card's seed hints + the confirm-then-one-question
  // reply contract for the first exchanges. Same overlay pattern as above.
  const templateSeedBlock = buildTemplateSeedBlock({
    templateId: thread.templateId,
    turnIdx,
  });
  // Manage mode (plan §4.3.4): separate prompt file + the per-turn CURRENT
  // BRIEF overlay — the overlay, not the (capped) transcript, is the
  // load-bearing state. Setup keeps its prompt + overlays byte-identical.
  const systemPrompt =
    mode === "manage" && boundSpec
      ? [
          loadManageAgentSystemPrompt(),
          buildManageContextBlock({
            name: boundSpec.name,
            version: boundSpec.version,
            status: boundSpec.status,
            spec: boundSpec.spec,
          }),
        ].join("\n\n")
      : [loadConfigAgentSystemPrompt(), priorCtxBlock, templateSeedBlock]
          .filter(Boolean)
          .join("\n\n");

  try {
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      // Exec RC7 / ACX.6: manage threads grow without bound, so manage turns
      // send a capped transcript (last N). The system prompt + per-turn spec
      // overlay ride outside `messages` and are the load-bearing state —
      // truncation never loses the spec. Setup turns untouched.
      messages:
        mode === "manage" ? capManageTranscript(body.messages) : body.messages,
      tools: buildAiSdkTools(agentCtx, mode),
      maxSteps: 6,
      temperature: 0.3,
      onError: ({ error }) => {
        // Surface the real cause — without this, the AI SDK swallows the
        // exception inside the stream and the client only sees the generic
        // "An error occurred." frame. (Incident 2026-06-01.)
        // Wave 4 Bug 5: also stamp a supportRef so end-users can reference
        // the incident without us leaking the underlying stack. The client
        // peels the [supportRef] tag off the message for display.
        const supportRef = generateSupportRef();
        console.error(`[chat] streamText error [ref=${supportRef}]:`, error);
        log.error("chat streamText error", {
          supportRef,
          err: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      },
      onFinish: async ({ text, toolCalls, toolResults, usage }) => {
        try {
          // ACX.1 (manage-mode wave, CTO-flagged isolated commit): every
          // chat-turn LLM call writes a cost_events row — closes a
          // pre-existing gap for BOTH modes ("don't add an LLM path without
          // wiring cost_events", CLAUDE.md rule 6). These rows are also the
          // RC7 monitoring signal that capManageTranscript holds (flat
          // per-turn input tokens as manage threads age). Best-effort:
          // recordCost never throws.
          const inputTokens = Number.isFinite(usage?.promptTokens)
            ? usage.promptTokens
            : 0;
          const outputTokens = Number.isFinite(usage?.completionTokens)
            ? usage.completionTokens
            : 0;
          void recordCost({
            userId: user.id,
            kind: "llm_call",
            provider: "openai",
            model: "gpt-4o-mini",
            inputTokens,
            outputTokens,
            costUsd: openaiCostUsd("gpt-4o-mini", inputTokens, outputTokens),
          });
          // Wave 5 Bug 12 (P0): scrub quick-reply chip JSON that gpt-4o-mini
          // sometimes embeds into its free-text turn. The chip strip below
          // the bubble is the only legit render surface; raw JSON in the
          // bubble body is the regression we're closing.
          const cleanText = stripQuickReplyLeak(text ?? "");
          // Persist a structured assistant turn.
          await db.insert(chatMessages).values({
            threadId: thread.id,
            role: "assistant",
            content: {
              kind: "assistant_turn",
              text: cleanText,
              toolCalls: toolCalls ?? [],
              toolResults: toolResults ?? [],
              savedSpecId: session.savedSpecId,
            },
          });
          // Wave 3 (CAD-181): funnel telemetry — best-effort.
          void recordChatTurn({
            userId: user.id,
            threadId: thread.id,
            role: "assistant",
            charCount: (text ?? "").length,
            toolCallCount: toolCalls?.length ?? 0,
            savedSpec: !!session.savedSpecId,
          });

          // T-408: persist the working draft so the next turn sees it.
          // Manage mode (plan §4.2): on successful save, flag ON writes the
          // spec binding and keeps the thread ALIVE (status stays 'active')
          // — the thread becomes/remains a manage thread. Flag OFF preserves
          // the legacy status='completed' terminal write (§7.2 rollback
          // contract). Either way draft_spec clears (the canonical record is
          // now in digest_specs) and updatedAt is touched EVERY turn so
          // bare-/chat recency ordering stays honest (exec advisory 10).
          if (session.savedSpecId) {
            await db
              .update(chatThreads)
              .set(
                manageOn
                  ? {
                      specId: session.savedSpecId,
                      draftSpec: null,
                      updatedAt: new Date(),
                    }
                  : {
                      status: "completed",
                      draftSpec: null,
                      updatedAt: new Date(),
                    }
              )
              .where(eq(chatThreads.id, thread.id));
            // ACX.5: a setup save under the flag is the moment the thread
            // BECOMES a manage thread, still in the same session.
            if (manageOn && mode === "setup") {
              log.info("manage_thread_resumed", {
                userId: user.id,
                threadId: thread.id,
                specId: session.savedSpecId,
                source: "post_save_same_session",
              });
            }
          } else if (session.draft) {
            await db
              .update(chatThreads)
              .set({
                draftSpec: session.draft,
                updatedAt: new Date(),
              })
              .where(eq(chatThreads.id, thread.id));
          } else {
            await db
              .update(chatThreads)
              .set({ updatedAt: new Date() })
              .where(eq(chatThreads.id, thread.id));
          }
        } catch (err) {
          log.error("chat onFinish persist failed", { err: String(err) });
        }
      },
    });

    return result.toDataStreamResponse({
      // Wave 4 Bug 5: friendly client-facing envelope. The raw error.message
      // can be a JSON-stringified stack (provider 5xx, tool throws, etc.)
      // which used to render as raw JSON in the chat bubble. Stamp a typed
      // payload the client can switch on, plus a supportRef the user can
      // quote. The full error is already logged server-side via onError.
      getErrorMessage: (error) => {
        const supportRef = generateSupportRef();
        const code = classifyChatError(error);
        log.error("chat error envelope", {
          supportRef,
          code,
          err: error instanceof Error ? error.message : String(error),
        });
        const envelope = {
          code,
          userMessage:
            code === "rate_limited"
              ? "You're sending messages a little too fast. Give it a moment and try again."
              : "Something went wrong on our end. Tap retry to give it another go.",
          supportRef,
        };
        return JSON.stringify(envelope);
      },
    });
  } catch (err) {
    const supportRef = generateSupportRef();
    log.error("chat stream failed", {
      supportRef,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        code: "stream_failed",
        userMessage:
          "Something went wrong on our end. Tap retry to give it another go.",
        supportRef,
      },
      { status: 500 }
    );
  }
}

/**
 * Wave 4 Bug 5: typed error code so the client can decide whether to
 * auto-retry. transient -> retry once silently; everything else -> show
 * the friendly bubble + manual retry CTA.
 */
function classifyChatError(error: unknown): string {
  const msg =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/timeout|timed out|etimedout/.test(msg)) return "timeout";
  if (/rate limit|429|too many requests/.test(msg)) return "rate_limited";
  if (/\b5(0[023])\b|bad gateway|service unavailable|gateway timeout/.test(msg))
    return "upstream_5xx";
  if (/abort/.test(msg)) return "aborted";
  return "unknown";
}

/**
 * Wave 4 Bug 5: short, copy-pastable incident reference users can quote in
 * support emails. Crockford-style alphanumeric, no ambiguous chars. Pure;
 * uses crypto.getRandomValues in the edge/node runtime.
 */
function generateSupportRef(): string {
  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(10);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
