/**
 * Persisted message shape pulled from chat_messages.content (jsonb).
 *
 * Shape contract is shared between the Next.js route (/api/chat) that
 * writes and the chat client that reads. Keep it permissive — old rows
 * may predate fields, so always default-coalesce when reading.
 */
export type PersistedContent =
  | { kind: "user_text"; text: string }
  | {
      kind: "assistant_turn";
      text: string;
      toolCalls?: Array<{
        toolCallId: string;
        toolName: string;
        args: unknown;
      }>;
      toolResults?: Array<{
        toolCallId: string;
        toolName: string;
        result: unknown;
      }>;
      savedSpecId?: string;
    };

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: PersistedContent;
  createdAt: string;
}
