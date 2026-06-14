/**
 * Manage-mode client helpers beside the brief-actions resolver
 * (manage-mode plan §3.1 item 4, §4.6 / exec advisory 12):
 *
 *  - panelYielded — the post-save actions panel renders only while no
 *    USER message exists after the message carrying its triggering save
 *    event; pure derivation from message order (Design risk 2).
 *  - scanSavedSpecId / resolveSavedSpecId — the thread-bound
 *    initialSavedSpecId (= chat_threads.spec_id, server-authoritative)
 *    beats any tool result lingering in transcript history; the scan
 *    recognizes BOTH confirm_and_save and save_changes results (same
 *    {spec_id, version} shape by contract, §4.3.3).
 */
import { describe, expect, it } from "vitest";
import type { Message } from "ai";
import {
  panelYielded,
  resolveSavedSpecId,
  scanSavedSpecId,
  type PanelYieldItem,
} from "@/components/chat/brief-actions.helpers";

type ToolInvocation = NonNullable<Message["toolInvocations"]>[number];

function saveResult(
  toolName: "confirm_and_save" | "save_changes",
  specId: string
): ToolInvocation {
  return {
    toolCallId: `tc-${toolName}`,
    toolName,
    state: "result",
    args: {},
    result: { ok: true, spec_id: specId, version: 2 },
  } as unknown as ToolInvocation;
}

function assistantTurn(invocations: ToolInvocation[] = [], text = ""): Message {
  return {
    id: `a-${Math.random()}`,
    role: "assistant",
    content: text,
    toolInvocations: invocations.length > 0 ? invocations : undefined,
  };
}

function userTurn(text: string): Message {
  return { id: `u-${Math.random()}`, role: "user", content: text };
}

const u = (): PanelYieldItem => ({ role: "user", saveEvent: false });
const a = (saveEvent = false): PanelYieldItem => ({
  role: "assistant",
  saveEvent,
});

describe("panelYielded — §3.1 item 4 render-position rule", () => {
  it("save event with no user message after it → panel shows (not yielded)", () => {
    expect(panelYielded([u(), a(), u(), a(true)])).toBe(false);
  });

  it("any user message after the save event → yielded", () => {
    expect(panelYielded([u(), a(true), u()])).toBe(true);
    // …even with assistant turns in between.
    expect(panelYielded([u(), a(true), a(), u(), a()])).toBe(true);
  });

  it("a NEWER save event re-arms the panel for that event", () => {
    expect(panelYielded([a(true), u(), a(true)])).toBe(false);
  });

  it("no save event at all (lazy-created / reactivated thread): thread start is the event — yields on the user's first message", () => {
    // Seed bubbles only → panel shows.
    expect(panelYielded([a(), a()])).toBe(false);
    // User spoke → yielded.
    expect(panelYielded([a(), a(), u()])).toBe(true);
    // Empty transcript → nothing to yield to.
    expect(panelYielded([])).toBe(false);
  });
});

describe("savedSpecId resolution — exec advisory 12 precedence", () => {
  it("scan returns the LATEST confirm_and_save result, scanning from the end", () => {
    const msgs = [
      assistantTurn([saveResult("confirm_and_save", "spec-old")]),
      userTurn("change it"),
      assistantTurn([saveResult("confirm_and_save", "spec-new")]),
    ];
    expect(scanSavedSpecId(msgs)).toBe("spec-new");
  });

  it("scan recognizes save_changes results — same {spec_id} shape (§4.3.3)", () => {
    const msgs = [
      userTurn("drop corn"),
      assistantTurn([saveResult("save_changes", "spec-bound")]),
    ];
    expect(scanSavedSpecId(msgs)).toBe("spec-bound");
  });

  it("scan ignores user turns, text-only assistant turns, and unrelated tools", () => {
    const other = {
      toolCallId: "tc-ask",
      toolName: "ask_user",
      state: "result",
      args: {},
      result: { question: "How often?" },
    } as unknown as ToolInvocation;
    expect(
      scanSavedSpecId([userTurn("hi"), assistantTurn([other], "sure")])
    ).toBeNull();
    expect(scanSavedSpecId([])).toBeNull();
  });

  it("initialSavedSpecId (thread binding) BEATS a stale tool result — the CAD-212 path", () => {
    // A reused/legacy thread's history can contain a confirm_and_save
    // result pointing at a DIFFERENT spec than the thread's binding
    // (confirm_and_save under the cap hands is_current to a NEW spec).
    const msgs = [assistantTurn([saveResult("confirm_and_save", "spec-stale")])];
    expect(resolveSavedSpecId("spec-bound", msgs)).toBe("spec-bound");
  });

  it("no binding (live setup session) → the fresh tool result drives the panel, exactly as shipped", () => {
    const msgs = [assistantTurn([saveResult("confirm_and_save", "spec-fresh")])];
    expect(resolveSavedSpecId(null, msgs)).toBe("spec-fresh");
    expect(resolveSavedSpecId(undefined, msgs)).toBe("spec-fresh");
    expect(resolveSavedSpecId(null, [])).toBeNull();
  });
});
