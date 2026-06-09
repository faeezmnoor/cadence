/**
 * Chat funnel telemetry writers.
 *
 * Append-only inserts into chat_turn_event + spec_extraction_event. Both
 * are best-effort: errors are logged but never bubbled up — we will not
 * fail a chat turn over a missing audit row.
 *
 * See blueprint/chat-ux-parity-v1.md §3.1 + §3.3, and migration 0025.
 */
import { and, count, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  chatMessages,
  chatTurnEvents,
  specExtractionEvents,
} from "@/server/db/schema";
import { log } from "@/lib/log";

export interface RecordTurnInput {
  userId: string;
  threadId: string;
  role: "user" | "assistant";
  charCount: number;
  toolCallCount?: number;
  savedSpec?: boolean;
}

/**
 * Record one user or assistant turn. turn_idx is derived from the current
 * chat_messages count for the thread so we never have to thread state
 * through the streaming pipeline.
 */
export async function recordChatTurn(input: RecordTurnInput): Promise<void> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, input.threadId));
    const turnIdx = (row?.n ?? 0) as number;
    await db.insert(chatTurnEvents).values({
      userId: input.userId,
      threadId: input.threadId,
      turnIdx,
      role: input.role,
      charCount: input.charCount,
      toolCallCount: input.toolCallCount ?? 0,
      savedSpec: input.savedSpec ?? false,
    });
  } catch (err) {
    log.warn("chat-telemetry: recordChatTurn failed", { err: String(err) });
  }
}

export interface RecordExtractionInput {
  userId: string;
  threadId: string;
  turnIdx: number;
  rawExtracted: unknown;
  appliedSlots: unknown;
  proposedSlots: unknown;
  droppedSlots: unknown;
  latencyMs?: number;
  costMicroUsd?: number;
  status: "ok" | "timeout" | "error" | "disabled";
  error?: string;
}

export async function recordExtractionEvent(
  input: RecordExtractionInput
): Promise<void> {
  try {
    await db.insert(specExtractionEvents).values({
      userId: input.userId,
      threadId: input.threadId,
      turnIdx: input.turnIdx,
      rawExtracted: input.rawExtracted as object,
      appliedSlots: input.appliedSlots as object,
      proposedSlots: input.proposedSlots as object,
      droppedSlots: input.droppedSlots as object,
      latencyMs: input.latencyMs,
      costMicroUsd: input.costMicroUsd,
      status: input.status,
      error: input.error,
    });
  } catch (err) {
    log.warn("chat-telemetry: recordExtractionEvent failed", {
      err: String(err),
    });
  }
}

// Suppress unused-import warning until the parent thread filter is needed.
void and;
