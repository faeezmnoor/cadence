/**
 * buildManageSeedSummary — deterministic seed bubbles for a lazy-created
 * manage thread (manage-mode plan §3.6 / §4.2, AC7.2).
 *
 * Two server-side assistant rows, no LLM — first paint never waits on a
 * model. Copy is final-candidate per COPY_GUIDE:
 *
 *   Bubble 1: "Here's your brief: {topics, plain-joined}, {humanized
 *             schedule}."
 *   Bubble 2: "Ask me for a sample, or tell me what to change."
 *
 * Banned vocabulary (COPY_GUIDE §4a/§4c, ACX.4): no "digest", "spec",
 * "config", "manage mode", "thread", "session" — enforced by unit test
 * (test/manage-seed.test.ts), not convention. Schedule text routes through
 * the lifted `humanizeSchedule` (exec RC2) so the seed, the transition
 * message, and the /briefs card can never disagree — never raw cron or
 * snake_case (ACX.3).
 *
 * The seed is for the USER's orientation only; the agent answers "what does
 * this brief watch?" from the per-turn spec context overlay (§4.3.4), which
 * is the load-bearing context (AC7.3).
 */
import { humanizeSchedule } from "@/lib/schedule";

/**
 * humanizeSchedule outputs lead with a capitalized cadence word ("Daily at
 * 08:00 (Asia/Kuala_Lumpur)") because the /briefs card renders them
 * standalone. Mid-sentence we lowercase that first word — but ONLY when it
 * is a known cadence opener, so day-name-first labels ("Mon, Wed at 08:00")
 * keep their proper capitalization.
 */
const LOWERCASABLE_OPENERS = new Set([
  "Daily",
  "Weekdays",
  "Weekly",
  "Monthly",
  "Custom:",
  "Schedule",
]);

export function embedScheduleLabel(label: string): string {
  const firstWord = label.split(" ", 1)[0] ?? "";
  if (LOWERCASABLE_OPENERS.has(firstWord)) {
    return label.charAt(0).toLowerCase() + label.slice(1);
  }
  return label;
}

/** Oxford-comma plain join (COPY_GUIDE §7): a · a and b · a, b, and c. */
export function joinTopicsPlain(topics: string[]): string {
  const xs = topics.map((t) => t.trim()).filter((t) => t.length > 0);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0]!;
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

export interface ManageSeedInput {
  /** digest_specs.spec jsonb — only `topics` is read, defensively. */
  spec: unknown;
  /** digest_specs.scheduling jsonb (SchedulingRuleV1, possibly '{}'). */
  scheduling: unknown;
}

/** Returns exactly two assistant bubble texts, in render order. */
export function buildManageSeedSummary(input: ManageSeedInput): [string, string] {
  const topics = extractTopics(input.spec);
  const schedule = embedScheduleLabel(humanizeSchedule(input.scheduling));
  const topicsJoined = joinTopicsPlain(topics);

  const bubble1 = topicsJoined
    ? `Here's your brief: ${topicsJoined}, ${schedule}.`
    : `Here's your brief — ${schedule}.`;
  const bubble2 = "Ask me for a sample, or tell me what to change.";
  return [bubble1, bubble2];
}

function extractTopics(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const raw = (spec as { topics?: unknown }).topics;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string");
}
