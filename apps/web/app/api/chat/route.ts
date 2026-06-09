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
import { chatMessages, chatThreads } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { buildAiSdkTools } from "@/server/ai/config-agent/runtime";
import { saveSpecForUser } from "@/server/ai/config-agent/save-spec";
import { loadConfigAgentSystemPrompt } from "@/server/ai/config-agent/system-prompt";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";
import {
  digestSpecDraftSchema,
  type DigestSpecDraft,
} from "@/lib/digest-spec/schema";
import { log } from "@/lib/log";
import { detectMultiTopic, MULTI_TOPIC_REFUSAL } from "@/lib/chat/multi-topic";
import { checkRateLimit } from "@/server/rate-limit/check";
import {
  recordChatTurn,
  recordExtractionEvent,
} from "@/server/chat/telemetry";
import { extractSlots } from "@/server/ai/config-agent/extract";
import { stripQuickReplyLeak } from "@/lib/chat/sanitize";
import {
  mergeExtractedSlots,
  type AppliedSlots,
} from "@/server/ai/config-agent/slot-merge";
import { buildPriorContextBlock } from "@/server/ai/config-agent/prior-context";
import { count } from "drizzle-orm";

const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_SECONDS = 60;

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequestBody {
  threadId: string;
  messages: Message[];
}

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
  if (thread.status !== "active") {
    return NextResponse.json(
      { error: "thread is not active" },
      { status: 409 }
    );
  }

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
  }

  // QA P1 #4: server-side mirror of the multi-topic refusal. The client
  // intercepts before submit, but non-browser callers (curl, future API
  // clients, a buggy/tampered client) would otherwise hit the LLM directly
  // and let three topics fold into one spec. Mirror the same heuristic
  // here and short-circuit with a persisted assistant refusal turn — no
  // streamText call, no LLM cost.
  if (lastMsg?.role === "user") {
    const detection = detectMultiTopic(lastUserText);
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

  // Wave 3 / CAD-182: per-turn slot extraction. Runs in parallel with any
  // other prep work; soft-timeout at 2s; empty slots on error so the rest
  // of the pipeline degrades to the pre-Wave-3 flow.
  let mergedDraft = hydratedDraft;
  let proposedSlots: AppliedSlots = {};
  let appliedSlots: AppliedSlots = {};
  if (lastUserText) {
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
    const turnIdx = (turnIdxRow[0]?.n ?? 0) as number;

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
  };
  const agentCtx: ConfigAgentContext = {
    session,
    saveSpec: saveSpecForUser,
  };

  // PRIOR CONTEXT block: if anything was applied or proposed this turn,
  // inject a short system addendum so the agent doesn't re-ask filled
  // slots and frames a confirm-style follow-up on proposals. The base
  // prompt stays canonical on disk — this is a per-turn overlay.
  const priorCtxBlock = buildPriorContextBlock(mergedDraft, appliedSlots, proposedSlots);
  const systemPrompt = priorCtxBlock
    ? `${loadConfigAgentSystemPrompt()}\n\n${priorCtxBlock}`
    : loadConfigAgentSystemPrompt();

  try {
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: body.messages,
      tools: buildAiSdkTools(agentCtx),
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
      onFinish: async ({ text, toolCalls, toolResults }) => {
        try {
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
          // On successful save we also clear draft_spec (the canonical
          // record is now in digest_specs) and mark the thread completed.
          if (session.savedSpecId) {
            await db
              .update(chatThreads)
              .set({
                status: "completed",
                draftSpec: null,
                updatedAt: new Date(),
              })
              .where(eq(chatThreads.id, thread.id));
          } else if (session.draft) {
            await db
              .update(chatThreads)
              .set({
                draftSpec: session.draft,
                updatedAt: new Date(),
              })
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
