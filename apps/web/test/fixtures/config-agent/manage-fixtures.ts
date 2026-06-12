/**
 * Brief manage mode — the EDIT GOLDEN SET (plan §4.4, deterministic suite).
 *
 * Each fixture replays the manage-mode tool-call sequence the agent would
 * make against an EXISTING saved brief: the session draft is seeded from
 * the saved spec via `specToDraft` (mirroring the route's hydration), edits
 * are staged with `update_spec_field`/`propose_spec`, and `save_changes`
 * applies them through a stubbed `updateSpec` (production:
 * updateSpecInPlace). No LLM in the loop — this tests the tool plumbing,
 * draft merge semantics, and the finalizeDraft Zod gate on the EDIT path.
 *
 * Threshold = all pass. The set grows from production learning_log /
 * transcript misses after ship (plan §4.4) — append, never rewrite.
 */
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

/** The brief the manage thread is bound to (strict, already saved). */
export const SAVED_SPEC: DigestSpecV1 = {
  schema_version: 1,
  topics: ["palm oil", "corn"],
  entities: { tickers: [], companies: ["SDP.KL"], commodities: ["CPO=F"] },
  keywords_include: [],
  keywords_exclude: [],
  data_addons: {
    show_prices: true,
    show_24h_change: true,
    show_7d_change: false,
    fx_pairs: ["MYR/USD"],
  },
  rss_feeds: [],
  cadence: {
    frequency: "daily",
    delivery_time_local: "08:00",
    days_of_week: [1, 2, 3, 4, 5],
  },
  tone_preset: "analyst_deep_dive",
  length_target: "medium",
  language: "en",
};

export const SAVED_VERSION = 3;

export type ManageToolCall =
  | { tool: "propose_spec"; args: { spec: unknown } }
  | { tool: "update_spec_field"; args: { path: string; value: unknown } }
  | { tool: "save_changes"; args: { user_confirmed: boolean } };

export interface ManageFixture {
  id: string;
  description: string;
  calls: ManageToolCall[];
  /** Full merged snapshot the `updateSpec` stub must receive. */
  expected: DigestSpecV1;
  /**
   * Whether the cadence changed vs SAVED_SPEC — the exact signal
   * updateSpecInPlace keys its scheduling/next_run_at recompute on
   * (fixture 3's "scheduling-recompute flag").
   */
  expectScheduleRecompute: boolean;
}

/** Fixtures 1–5 of the §4.4 golden set (6–9 are behavioral, in the suite). */
export const manageFixtures: ManageFixture[] = [
  {
    id: "1-topic-drop",
    description:
      "\"too much on corn, drop it\" — topics shrink, everything else byte-identical",
    calls: [
      { tool: "update_spec_field", args: { path: "topics", value: ["palm oil"] } },
      { tool: "save_changes", args: { user_confirmed: true } },
    ],
    expected: { ...SAVED_SPEC, topics: ["palm oil"] },
    expectScheduleRecompute: false,
  },
  {
    id: "2-topic-add",
    description: "\"also watch soybean oil\" — topics grow, rest untouched",
    calls: [
      {
        tool: "update_spec_field",
        args: { path: "topics", value: ["palm oil", "corn", "soybean oil"] },
      },
      { tool: "save_changes", args: { user_confirmed: true } },
    ],
    expected: { ...SAVED_SPEC, topics: ["palm oil", "corn", "soybean oil"] },
    expectScheduleRecompute: false,
  },
  {
    id: "3-cadence-change",
    description:
      "\"make it weekly on Mondays\" — cadence delta + scheduling-recompute flag",
    calls: [
      {
        tool: "update_spec_field",
        args: {
          path: "cadence",
          value: {
            frequency: "weekly",
            delivery_time_local: "08:00",
            days_of_week: [1],
          },
        },
      },
      { tool: "save_changes", args: { user_confirmed: true } },
    ],
    expected: {
      ...SAVED_SPEC,
      cadence: {
        frequency: "weekly",
        delivery_time_local: "08:00",
        days_of_week: [1],
      },
    },
    expectScheduleRecompute: true,
  },
  {
    id: "4-delivery-time-change",
    description: "\"make it 7am\" — dot-path leaf write into cadence",
    calls: [
      {
        tool: "update_spec_field",
        args: { path: "cadence.delivery_time_local", value: "07:00" },
      },
      { tool: "save_changes", args: { user_confirmed: true } },
    ],
    expected: {
      ...SAVED_SPEC,
      cadence: { ...SAVED_SPEC.cadence, delivery_time_local: "07:00" },
    },
    expectScheduleRecompute: true,
  },
  {
    id: "5-multi-field-edit",
    description:
      "combined delta — topics + tone + fx_pairs staged, length via propose_spec merge",
    calls: [
      {
        tool: "update_spec_field",
        args: {
          path: "topics",
          value: ["palm oil", "corn", "fertilizer prices"],
        },
      },
      {
        tool: "update_spec_field",
        args: { path: "tone_preset", value: "executive_brief" },
      },
      {
        tool: "update_spec_field",
        args: { path: "data_addons.fx_pairs", value: [] },
      },
      { tool: "propose_spec", args: { spec: { length_target: "short" } } },
      { tool: "save_changes", args: { user_confirmed: true } },
    ],
    expected: {
      ...SAVED_SPEC,
      topics: ["palm oil", "corn", "fertilizer prices"],
      tone_preset: "executive_brief",
      data_addons: { ...SAVED_SPEC.data_addons, fx_pairs: [] },
      length_target: "short",
    },
    expectScheduleRecompute: false,
  },
];
