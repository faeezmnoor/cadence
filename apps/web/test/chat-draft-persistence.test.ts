/**
 * T-408 / CAD-70 regression: the working draft must compose across chat
 * turns. We simulate two HTTP turns by:
 *
 *   Turn 1: build a fresh session, call update_spec_field.
 *   "Persist" by snapshotting session.draft (mimics route's onFinish
 *   writing chat_threads.draft_spec).
 *   Turn 2: build a NEW session (mimics the next request) but hydrate
 *   draft from the snapshot (mimics route reloading draft_spec).
 *   Call update_spec_field again on a different path.
 *
 * The bug being prevented: a previously stored field disappears because
 * the second turn started from emptyDraft().
 */
import { describe, expect, it, vi } from "vitest";
import { configAgentTools } from "@/server/ai/config-agent/tools";
import { digestSpecDraftSchema } from "@/lib/digest-spec/schema";
import type {
  ConfigAgentContext,
  ConfigAgentSession,
} from "@/server/ai/config-agent/types";

function makeCtx(initialDraft?: ConfigAgentSession["draft"]) {
  const session: ConfigAgentSession = {
    userId: "11111111-1111-1111-1111-111111111111",
    threadId: "22222222-2222-2222-2222-222222222222",
    draft: initialDraft,
  };
  const saveSpec = vi.fn().mockResolvedValue({ id: "spec-1", version: 1 });
  const ctx: ConfigAgentContext = { session, saveSpec };
  return { ctx, session, saveSpec };
}

describe("config agent: draft persistence across simulated turns", () => {
  it("update_spec_field across two turns composes (does not forget)", async () => {
    // ----- Turn 1 -----
    const turn1 = makeCtx();
    await configAgentTools.update_spec_field.handler(
      { path: "language", value: "ms" },
      turn1.ctx
    );
    expect(turn1.session.draft?.language).toBe("ms");

    // Snapshot — JSON round-trip mimics jsonb storage.
    const persisted = JSON.parse(JSON.stringify(turn1.session.draft));

    // Validate the snapshot still parses as a draft (catches the case where
    // we stored an exotic value that the route's rehydration would reject).
    expect(digestSpecDraftSchema.safeParse(persisted).success).toBe(true);

    // ----- Turn 2 (fresh session, hydrated from persisted) -----
    const turn2 = makeCtx(persisted);
    await configAgentTools.update_spec_field.handler(
      { path: "topics", value: ["palm oil"] },
      turn2.ctx
    );

    // The original field must survive.
    expect(turn2.session.draft?.language).toBe("ms");
    // The new field is also present.
    expect(turn2.session.draft?.topics).toEqual(["palm oil"]);
  });

  it("confirm_and_save works on a draft built across multiple turns", async () => {
    const turn1 = makeCtx();
    await configAgentTools.update_spec_field.handler(
      { path: "language", value: "en" },
      turn1.ctx
    );
    await configAgentTools.update_spec_field.handler(
      { path: "topics", value: ["chicken industry", "feed pricing"] },
      turn1.ctx
    );

    // Persist + rehydrate.
    const persisted = JSON.parse(JSON.stringify(turn1.session.draft));
    const turn2 = makeCtx(persisted);

    // Fill in remaining required field on turn 2.
    await configAgentTools.update_spec_field.handler(
      {
        path: "cadence",
        value: {
          frequency: "daily",
          delivery_time_local: "07:30",
          days_of_week: [1, 2, 3, 4, 5],
        },
      },
      turn2.ctx
    );

    // Finalize.
    const result = (await configAgentTools.confirm_and_save.handler(
      { user_confirmed: true },
      turn2.ctx
    )) as { ok: boolean; spec_id: string };
    expect(result.ok).toBe(true);
    expect(turn2.saveSpec).toHaveBeenCalledTimes(1);
    const call = turn2.saveSpec.mock.calls[0]![0] as {
      spec: { topics: string[]; cadence: { frequency: string } };
    };
    expect(call.spec.topics).toEqual(["chicken industry", "feed pricing"]);
    expect(call.spec.cadence.frequency).toBe("daily");
  });
});
