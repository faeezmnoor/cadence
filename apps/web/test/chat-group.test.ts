/**
 * Unit tests for the message grouping helper (blueprint §2.3).
 */
import { describe, expect, it } from "vitest";
import { groupMessages, type RenderableMessage } from "@/lib/chat/group";

function mk(
  id: string,
  role: RenderableMessage["role"],
  iso: string
): RenderableMessage {
  return { id, role, createdAt: new Date(iso) };
}

describe("groupMessages", () => {
  it("returns empty when input is empty", () => {
    expect(groupMessages([])).toEqual([]);
  });

  it("prepends a separator before the first message", () => {
    const out = groupMessages([mk("a", "user", "2026-06-09T08:13:00")]);
    expect(out[0]?.kind).toBe("separator");
    expect(out[1]?.kind).toBe("message");
  });

  it("groups consecutive same-sender messages within 2min", () => {
    const out = groupMessages([
      mk("a", "assistant", "2026-06-09T08:13:00"),
      mk("b", "assistant", "2026-06-09T08:13:30"),
      mk("c", "assistant", "2026-06-09T08:14:00"),
    ]);
    const messages = out.filter((i) => i.kind === "message") as Array<
      Extract<(typeof out)[number], { kind: "message" }>
    >;
    expect(messages[0]?.isFirstInGroup).toBe(true);
    expect(messages[0]?.isLastInGroup).toBe(false);
    expect(messages[1]?.isFirstInGroup).toBe(false);
    expect(messages[1]?.isLastInGroup).toBe(false);
    expect(messages[2]?.isFirstInGroup).toBe(false);
    expect(messages[2]?.isLastInGroup).toBe(true);
  });

  it("breaks a group when the sender changes", () => {
    const out = groupMessages([
      mk("a", "user", "2026-06-09T08:13:00"),
      mk("b", "assistant", "2026-06-09T08:13:10"),
    ]);
    const messages = out.filter((i) => i.kind === "message") as Array<
      Extract<(typeof out)[number], { kind: "message" }>
    >;
    expect(messages[0]?.isLastInGroup).toBe(true);
    expect(messages[1]?.isFirstInGroup).toBe(true);
  });

  it("breaks a group across the 2min window", () => {
    const out = groupMessages([
      mk("a", "assistant", "2026-06-09T08:13:00"),
      mk("b", "assistant", "2026-06-09T08:16:00"),
    ]);
    const messages = out.filter((i) => i.kind === "message") as Array<
      Extract<(typeof out)[number], { kind: "message" }>
    >;
    expect(messages[0]?.isLastInGroup).toBe(true);
    expect(messages[1]?.isFirstInGroup).toBe(true);
  });

  it("injects a separator across day boundaries", () => {
    const out = groupMessages([
      mk("a", "user", "2026-06-08T23:00:00"),
      mk("b", "user", "2026-06-09T01:00:00"),
    ]);
    const seps = out.filter((i) => i.kind === "separator");
    expect(seps.length).toBe(2); // leading + cross-day
  });
});
