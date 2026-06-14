/**
 * Brief manage mode — buildManageContextBlock + specToDraft (plan §4.3.4,
 * AC7.3, §6 unit rows).
 *
 * The overlay is the LOAD-BEARING state for manage turns: with the
 * transcript capped, the agent answers "what does this brief watch?" from
 * this block alone. specToDraft seeds the working draft from the saved
 * spec so edits layer onto reality.
 */
import { describe, expect, it } from "vitest";
import {
  buildManageContextBlock,
  specToDraft,
} from "@/server/ai/config-agent/manage-context";
import { emptyDraft } from "@/server/ai/config-agent/draft";

const SPEC = {
  schema_version: 1,
  topics: ["palm oil supply chain", "EU EUDR"],
  cadence: {
    frequency: "daily",
    delivery_time_local: "08:00",
    days_of_week: [1, 2, 3, 4, 5],
  },
};

describe("buildManageContextBlock", () => {
  it("carries name, status, version, and the full saved spec JSON", () => {
    const block = buildManageContextBlock({
      name: "Palm oil brief",
      version: 3,
      status: "active",
      spec: SPEC,
    });
    expect(block).toContain("CURRENT BRIEF");
    expect(block).toContain('"Palm oil brief"');
    expect(block).toContain("status: active");
    expect(block).toContain("internal version 3");
    expect(block).toContain('"palm oil supply chain"');
    expect(block).toContain('"EU EUDR"');
  });

  it("states the staged-draft contract: nothing changes until save_changes", () => {
    const block = buildManageContextBlock({
      name: "X",
      version: 1,
      status: "paused",
      spec: SPEC,
    });
    expect(block).toContain("staged on a draft");
    expect(block).toContain("save_changes");
    expect(block).toContain("status: paused");
  });
});

describe("specToDraft", () => {
  it("turns a saved spec into a working draft (fields preserved)", () => {
    const draft = specToDraft(SPEC);
    expect(draft.topics).toEqual(["palm oil supply chain", "EU EUDR"]);
    expect(draft.cadence?.delivery_time_local).toBe("08:00");
  });

  it("degrades malformed jsonb to an empty draft (never poisons the agent)", () => {
    expect(specToDraft({ topics: "not-an-array" })).toEqual(emptyDraft());
    expect(specToDraft(null)).toEqual(emptyDraft());
    expect(specToDraft("garbage")).toEqual(emptyDraft());
  });
});
