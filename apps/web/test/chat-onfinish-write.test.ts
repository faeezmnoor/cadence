/**
 * onFinishThreadWrite — the chat route's onFinish set-object choice
 * (exec PR review round 1, CTO R3).
 *
 * This pins the flag branch that decides a thread's fate after a save:
 * flag ON → spec binding written, thread stays alive (a manage thread);
 * flag OFF → the legacy status='completed' terminal write (§7.2 rollback
 * contract). Previously this decision lived inline in
 * app/api/chat/route.ts with no test.
 *
 * The helper deliberately returns NO updatedAt — the route stamps
 * `new Date()` on every turn (exec advisory 10); these tests also pin
 * that exclusion so the helper can't grow a competing clock.
 */
import { describe, expect, it } from "vitest";
import { onFinishThreadWrite } from "@/server/chat/on-finish-write";
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";

const SPEC_ID = "33333333-3333-3333-3333-333333333333";

const DRAFT: DigestSpecDraft = {
  topics: ["palm oil"],
  language: "en",
};

describe("onFinishThreadWrite — flag branch on a saved spec", () => {
  it("flag ON: writes the spec binding, clears the draft, NEVER touches status (thread stays active)", () => {
    const write = onFinishThreadWrite(true, SPEC_ID, DRAFT);
    expect(write).toEqual({ specId: SPEC_ID, draftSpec: null });
    expect(write).not.toHaveProperty("status");
  });

  it("flag OFF: legacy terminal write status='completed', clears the draft, no spec binding", () => {
    const write = onFinishThreadWrite(false, SPEC_ID, DRAFT);
    expect(write).toEqual({ status: "completed", draftSpec: null });
    expect(write).not.toHaveProperty("specId");
  });

  it("a save wins over a lingering draft in both flag states (draftSpec clears)", () => {
    expect(onFinishThreadWrite(true, SPEC_ID, DRAFT)).toMatchObject({
      draftSpec: null,
    });
    expect(onFinishThreadWrite(false, SPEC_ID, DRAFT)).toMatchObject({
      draftSpec: null,
    });
  });
});

describe("onFinishThreadWrite — no save this turn", () => {
  it("draft present: persists the working draft for the next turn (both flag states)", () => {
    expect(onFinishThreadWrite(true, undefined, DRAFT)).toEqual({
      draftSpec: DRAFT,
    });
    expect(onFinishThreadWrite(false, undefined, DRAFT)).toEqual({
      draftSpec: DRAFT,
    });
  });

  it("no draft: empty set object — the route's updatedAt touch is the only write", () => {
    expect(onFinishThreadWrite(true, undefined, undefined)).toEqual({});
    expect(onFinishThreadWrite(false, undefined, undefined)).toEqual({});
  });

  it("never emits its own updatedAt (the route stamps it, exec advisory 10)", () => {
    for (const write of [
      onFinishThreadWrite(true, SPEC_ID, DRAFT),
      onFinishThreadWrite(false, SPEC_ID, DRAFT),
      onFinishThreadWrite(true, undefined, DRAFT),
      onFinishThreadWrite(true, undefined, undefined),
    ]) {
      expect(write).not.toHaveProperty("updatedAt");
    }
  });
});
