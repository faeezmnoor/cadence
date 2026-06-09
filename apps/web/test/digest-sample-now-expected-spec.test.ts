/**
 * Dogfood-bugs 2026-06-09 regression: `digest.sampleNow` must refuse to
 * compose when the client-supplied `expectedSpecId` doesn't match the
 * user's actual `is_current` digest_spec.
 *
 * Without this guard, clicking "Send me one now" in the brief-creation
 * chat BEFORE the agent's `confirm_and_save` had persisted the new draft
 * spec composed a brief against the user's STALE is_current spec — Faeez
 * configured "Bitcoin" but got an "AI / LLM platforms" sample composed
 * from the prior smoke-seed spec.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const CURRENT_SPEC_ID = "11111111-1111-1111-1111-111111111111";
const STALE_SPEC_ID = "22222222-2222-2222-2222-222222222222";

vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: CURRENT_SPEC_ID }]),
        }),
      }),
    })),
  },
}));

vi.mock("@/server/digest/run", () => ({
  runDigestPipeline: vi.fn(async () => ({
    status: "delivered",
    digestRunId: "run-1",
    markdown: "ok",
    partsSent: 1,
    telegramMessageId: 1,
  })),
}));

import { appRouter } from "@/server/trpc/root";
import { runDigestPipeline } from "@/server/digest/run";

const runDigestSpy = runDigestPipeline as unknown as ReturnType<typeof vi.fn>;

function makeCtx() {
  return {
    user: { id: "u-self", email: "x@y.z" },
    headers: new Headers(),
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

describe("digest.sampleNow expectedSpecId guard", () => {
  beforeEach(() => {
    runDigestSpy?.mockClear();
  });

  it("composes when expectedSpecId matches the user's is_current spec", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const out = await caller.digest.sampleNow({
      dryRun: true,
      expectedSpecId: CURRENT_SPEC_ID,
    });
    expect(out.status).toBe("delivered");
    expect(runDigestSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses with PRECONDITION_FAILED when expectedSpecId is stale", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.digest.sampleNow({
        dryRun: true,
        expectedSpecId: STALE_SPEC_ID,
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(runDigestSpy).not.toHaveBeenCalled();
  });

  it("skips the guard when expectedSpecId is omitted (Telegram /sample, admin replay)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const out = await caller.digest.sampleNow({ dryRun: true });
    expect(out.status).toBe("delivered");
    expect(runDigestSpy).toHaveBeenCalledTimes(1);
  });
});
