/**
 * Brief manage mode — capManageTranscript (plan §4.3.4, exec RC7 / ACX.6).
 *
 * The cap bounds what the route forwards to streamText for manage turns:
 * last-N kept, OLDEST dropped, never mutates, and — by construction — has
 * no effect on the system prompt / spec overlay, which ride outside
 * `body.messages` (asserted here by the function signature: it only ever
 * sees the transcript array).
 */
import { describe, expect, it } from "vitest";
import {
  capManageTranscript,
  MANAGE_TRANSCRIPT_CAP,
} from "@/server/chat/manage-transcript";

function msgs(n: number): Array<{ id: number; role: string }> {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    role: i % 2 === 0 ? "user" : "assistant",
  }));
}

describe("capManageTranscript", () => {
  it("default cap is 20 (plan N≈20)", () => {
    expect(MANAGE_TRANSCRIPT_CAP).toBe(20);
  });

  it("returns short transcripts unchanged (copy, not same ref)", () => {
    const input = msgs(5);
    const out = capManageTranscript(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it("keeps exactly the LAST N when over the cap — oldest dropped", () => {
    const input = msgs(53);
    const out = capManageTranscript(input);
    expect(out).toHaveLength(MANAGE_TRANSCRIPT_CAP);
    expect(out[0]!.id).toBe(34); // 53 - 20 + 1
    expect(out[out.length - 1]!.id).toBe(53); // newest survives
  });

  it("exact-boundary transcript is kept whole", () => {
    const input = msgs(MANAGE_TRANSCRIPT_CAP);
    expect(capManageTranscript(input)).toHaveLength(MANAGE_TRANSCRIPT_CAP);
  });

  it("never mutates the input array", () => {
    const input = msgs(30);
    const snapshot = [...input];
    capManageTranscript(input);
    expect(input).toEqual(snapshot);
  });

  it("custom n is honored; n<=0 sends nothing rather than everything", () => {
    expect(capManageTranscript(msgs(10), 3).map((m) => m.id)).toEqual([
      8, 9, 10,
    ]);
    expect(capManageTranscript(msgs(10), 0)).toEqual([]);
  });
});
