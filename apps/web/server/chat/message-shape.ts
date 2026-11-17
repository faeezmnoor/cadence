/**
 * Hand-written shape check for the chat messages that reach `streamText`
 * (slice 005, security review F1; decision 0013).
 *
 * Why: `streamText` (ai 4.3) checks the messages with
 * `z.array(coreMessageSchema)`. On zod 3.25.76 (GHSA-mrhx-c7xc-m3w5) every
 * bad element builds a nested union error, so one sub-1-MiB request cost
 * 2.4–7 GB of memory (docs/records/reviews/005-zod-guard-security*.md). No
 * Zod here: plain checks that cost one pass over the array.
 *
 * What it allows is what `useChat` (@ai-sdk/react 1.2) sends: `role` user or
 * assistant, `content` a string (or an array of content parts), `parts`,
 * `toolInvocations` and `experimental_attachments` as arrays, extra fields
 * (`data`, `annotations`) ignored.
 *
 * The element cap counts only what the SDK can hand to Zod (verified in
 * ai 4.3.19 `convertToCoreMessages`): `step-start` and `source` parts are
 * dropped before validation, and `toolInvocations` is read only when a
 * message has no `parts`. Counting them would refuse real threads (a live
 * assistant turn repeats every tool call in both arrays) for no safety gain.
 *
 * Imports nothing, so the measurement script can load it under plain Node.
 */

/** Messages that may reach `streamText` in one request. */
export const MAX_CHAT_MESSAGES = 200;
/** Elements (parts, content parts, tool calls, attachments, reasoning details) summed across the request. */
export const MAX_CHAT_MESSAGE_ELEMENTS = 500;

export type ChatShapeResult = { ok: true } | { ok: false; reason: string };

/** Refusals a legitimate but very long setup chat can reach (the rest need a hand-built request). */
export const THREAD_LENGTH_REASONS: ReadonlySet<string> = new Set(["too_many_messages", "too_many_elements"]);
/**
 * Shown, with no Retry, when a setup chat passes a cap (review round 2,
 * below-bar note). COPY_GUIDE §6–7: what happened in under 8 words, then the
 * one action, which is the setup chat's own "Start over" control.
 */
export const THREAD_TOO_LONG_MESSAGE =
  "This chat has reached its limit. Tap Start over to set up your brief in a fresh chat.";

const ROLES = new Set(["user", "assistant"]);
/** Part types the AI SDK 4.x UI stream produces. */
const PART_TYPES = new Set(["text", "step-start", "tool-invocation", "source", "reasoning", "file"]);
/** Parts `convertToCoreMessages` drops before the Zod check. */
const UNCOUNTED_PART_TYPES = new Set(["step-start", "source"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The one nested field Zod checks key by key on user and assistant messages
 * and their parts (a record of records), so a single element could carry
 * thousands of bad keys. `useChat` never sends it.
 */
function hasProviderOptions(v: Record<string, unknown>): boolean {
  return "providerOptions" in v || "experimental_providerMetadata" in v;
}

function isToolInvocation(v: unknown): boolean {
  return isObject(v) && typeof v.toolCallId === "string" && typeof v.toolName === "string";
}

/** Returns the number of elements it adds to the cap, or a reason. */
function checkPart(part: unknown): number | string {
  if (!isObject(part) || typeof part.type !== "string") return "part_shape";
  if (hasProviderOptions(part)) return "provider_options";
  if (!PART_TYPES.has(part.type)) return "part_type";
  switch (part.type) {
    case "text":
      return typeof part.text === "string" ? 1 : "text_part";
    case "tool-invocation":
      return isToolInvocation(part.toolInvocation) ? 1 : "tool_part";
    case "file":
      return typeof part.data === "string" && typeof part.mimeType === "string" ? 1 : "file_part";
    case "reasoning": {
      if (!Array.isArray(part.details)) return "reasoning_part";
      for (const d of part.details) {
        if (!isObject(d)) return "reasoning_detail";
        if (d.type === "text" ? typeof d.text !== "string" : d.type !== "redacted" || typeof d.data !== "string") {
          return "reasoning_detail";
        }
      }
      return 1 + part.details.length;
    }
    default:
      return UNCOUNTED_PART_TYPES.has(part.type) ? 0 : 1;
  }
}

function checkContentPart(part: unknown): boolean {
  if (!isObject(part) || typeof part.type !== "string" || hasProviderOptions(part)) return false;
  return part.type !== "text" || typeof part.text === "string";
}

/**
 * Check the messages that will be handed to `streamText`. Returns a short
 * fixed reason for the log; never echoes the payload.
 */
export function checkChatMessagesShape(messages: unknown): ChatShapeResult {
  if (!Array.isArray(messages)) return { ok: false, reason: "not_array" };
  if (messages.length > MAX_CHAT_MESSAGES) return { ok: false, reason: "too_many_messages" };

  let elements = 0;
  const over = () => elements > MAX_CHAT_MESSAGE_ELEMENTS;

  for (const m of messages) {
    if (!isObject(m)) return { ok: false, reason: "message_shape" };
    if (typeof m.role !== "string" || !ROLES.has(m.role)) return { ok: false, reason: "role" };
    if (hasProviderOptions(m)) return { ok: false, reason: "provider_options" };

    const { content, parts, toolInvocations, experimental_attachments: attachments } = m;
    if (content !== undefined && typeof content !== "string") {
      if (!Array.isArray(content)) return { ok: false, reason: "content" };
      for (const c of content) if (!checkContentPart(c)) return { ok: false, reason: "content_part" };
      elements += content.length;
    }
    if (parts !== undefined) {
      if (!Array.isArray(parts)) return { ok: false, reason: "parts" };
      for (const p of parts) {
        const n = checkPart(p);
        if (typeof n === "string") return { ok: false, reason: n };
        elements += n;
        if (over()) return { ok: false, reason: "too_many_elements" };
      }
    }
    if (toolInvocations !== undefined) {
      if (!Array.isArray(toolInvocations)) return { ok: false, reason: "tool_invocations" };
      for (const t of toolInvocations) if (!isToolInvocation(t)) return { ok: false, reason: "tool_invocation" };
      if (parts === undefined) elements += toolInvocations.length;
    }
    if (attachments !== undefined) {
      if (!Array.isArray(attachments)) return { ok: false, reason: "attachments" };
      for (const a of attachments) if (!isObject(a) || typeof a.url !== "string") return { ok: false, reason: "attachment" };
      elements += attachments.length;
    }
    if (over()) return { ok: false, reason: "too_many_elements" };
  }
  return { ok: true };
}
