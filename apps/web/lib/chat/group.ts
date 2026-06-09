/**
 * Message grouping helper — consecutive same-sender messages within
 * GROUP_WINDOW_MS are visually grouped (no double border between them, only
 * the last in the group shows the meta-row).
 *
 * Pure function. Inputs are the rendered chat messages with their
 * resolved timestamps. Output is a flat array of "items" (message or
 * date-separator) carrying position-in-group flags the renderer needs.
 *
 * Locked decisions (blueprint §2.3):
 *  - Group window: 2 minutes within the same sender.
 *  - "Cadence" caption: shown above the FIRST assistant bubble in each
 *    group (renderer applies it when `isFirstInGroup && role !== "user"`).
 *  - Meta-row: rendered only when `isLastInGroup` is true.
 */
import { crossesDayBoundary } from "./format-time";

const GROUP_WINDOW_MS = 2 * 60 * 1000;

export type ChatRole = "user" | "assistant" | "tool";

export interface RenderableMessage {
  id: string;
  role: ChatRole;
  createdAt: Date;
}

export interface GroupedMessage<M extends RenderableMessage> {
  kind: "message";
  message: M;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

export interface DateSeparator {
  kind: "separator";
  id: string;
  at: Date;
}

export type GroupedItem<M extends RenderableMessage> =
  | GroupedMessage<M>
  | DateSeparator;

export function groupMessages<M extends RenderableMessage>(
  messages: M[]
): GroupedItem<M>[] {
  if (messages.length === 0) return [];

  const out: GroupedItem<M>[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const prev = i > 0 ? messages[i - 1]! : null;

    // Inject a separator before the first message and across day boundaries.
    if (!prev || crossesDayBoundary(prev.createdAt, m.createdAt)) {
      out.push({ kind: "separator", id: `sep-${m.id}`, at: m.createdAt });
    }

    const isFirstInGroup =
      !prev ||
      prev.role !== m.role ||
      crossesDayBoundary(prev.createdAt, m.createdAt) ||
      m.createdAt.getTime() - prev.createdAt.getTime() > GROUP_WINDOW_MS;

    const next = i < messages.length - 1 ? messages[i + 1]! : null;
    const isLastInGroup =
      !next ||
      next.role !== m.role ||
      crossesDayBoundary(m.createdAt, next.createdAt) ||
      next.createdAt.getTime() - m.createdAt.getTime() > GROUP_WINDOW_MS;

    out.push({ kind: "message", message: m, isFirstInGroup, isLastInGroup });
  }

  return out;
}
