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
import { log } from "@/lib/log";

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
  if (lastMsg?.role === "user") {
    await db.insert(chatMessages).values({
      threadId: thread.id,
      role: "user",
      content: { kind: "user_text", text: lastMsg.content },
    });
  }

  // Session is per-request: the agent's draft state lives in memory for
  // this turn only. If a previous turn called confirm_and_save we reflect
  // that by checking digest_specs, but for now the LLM rebuilds draft
  // intent from prior tool calls (which it sees in the message history).
  const session: ConfigAgentSession = {
    userId: user.id,
    threadId: thread.id,
  };
  const agentCtx: ConfigAgentContext = {
    session,
    saveSpec: saveSpecForUser,
  };

  const systemPrompt = loadConfigAgentSystemPrompt();

  try {
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: body.messages,
      tools: buildAiSdkTools(agentCtx),
      maxSteps: 6,
      temperature: 0.3,
      onFinish: async ({ text, toolCalls, toolResults }) => {
        try {
          // Persist a structured assistant turn.
          await db.insert(chatMessages).values({
            threadId: thread.id,
            role: "assistant",
            content: {
              kind: "assistant_turn",
              text: text ?? "",
              toolCalls: toolCalls ?? [],
              toolResults: toolResults ?? [],
              savedSpecId: session.savedSpecId,
            },
          });

          // If the agent successfully saved, mark the thread completed.
          if (session.savedSpecId) {
            await db
              .update(chatThreads)
              .set({ status: "completed", updatedAt: new Date() })
              .where(eq(chatThreads.id, thread.id));
          }
        } catch (err) {
          log.error("chat onFinish persist failed", { err: String(err) });
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (err) {
    log.error("chat stream failed", { err: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "stream failed" },
      { status: 500 }
    );
  }
}
