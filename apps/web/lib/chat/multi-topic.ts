/**
 * MUST-SHIP #5: detect multi-topic intent in a user's chat message.
 *
 * The MVP contract is one topic per brief. If a user opens with
 * "TikTok Live and Shopee Live and crypto", we want to refuse gracefully
 * — pick one — instead of letting the config agent quietly fold three
 * unrelated topics into a single spec and ship a brief that's mush.
 *
 * Detection is intentionally cheap + heuristic. False positives are worse
 * than false negatives (we'd block a legitimate single-topic with
 * conjunctions like "AI and robotics"), so we require:
 *   1. A multi-noun-phrase signal (commas, " and ", " plus ", " & ", " or ").
 *   2. AT LEAST 3 distinct candidates after splitting + cleanup. Two
 *      candidates is almost always a single industry with a qualifier
 *      ("palm oil and EUDR", "S&P 500 and watchlist"). Three+ is when
 *      users start scope-creeping.
 *
 * Runs on BOTH surfaces — client-side before the chat round-trip (no LLM
 * cost, no draft pollution) and mirrored server-side in /api/chat for
 * non-browser callers (QA P1 #4). Since dogfood 2026-06-11 both surfaces
 * must go through `detectMultiTopicIntake`, which gates detection to the
 * thread's FIRST user message — later turns answer the agent's own list
 * questions and must pass through untouched.
 */

/**
 * Sanity bound on refusal chips. NOT a truncation budget: the chips echo
 * the user's own enumeration back, so every item must survive (dogfood
 * 2026-06-11: a cap-at-4 silently dropped "sleekflow" from a 5-item
 * list). The strip flex-wraps, so up to 6 render fine; past 6 the
 * message is noise, not enumeration.
 */
const MAX_CANDIDATES = 6;

/**
 * Words that, when used between two short noun phrases, signal the user
 * is enumerating distinct topics rather than qualifying one.
 */
const CONJUNCTIONS = [
  /\s+and\s+/i,
  /\s+plus\s+/i,
  /\s+&\s+/,
  /\s*\+\s*/,
  /\s*,\s*/,
];

/**
 * Heuristic — strip leading filler so we don't pick up "I want X and Y".
 */
function stripFiller(raw: string): string {
  return raw
    .replace(/^(i\s+(want|need|would like)\s+|please\s+|can\s+you\s+|give\s+me\s+|brief\s+me\s+on\s+|track\s+|cover\s+|follow\s+)/i, "")
    .trim();
}

/**
 * Split on any conjunction and return non-empty, trimmed candidates.
 */
function splitCandidates(text: string): string[] {
  let parts: string[] = [text];
  for (const re of CONJUNCTIONS) {
    parts = parts.flatMap((p) => p.split(re));
  }
  return parts
    .map((p) => p.replace(/[.!?]+$/, "").trim())
    .filter((p) => p.length > 0 && p.length <= 80);
}

export interface MultiTopicDetection {
  multiTopic: boolean;
  candidates: string[];
}

/**
 * Detect whether `text` contains 3+ distinct topic candidates.
 *
 * - Returns `{multiTopic: false, candidates: []}` for short messages, single
 *   topics, or natural English with one or two clauses.
 * - Returns `{multiTopic: true, candidates}` when 3+ candidates emerge —
 *   `candidates` is title-cased + de-duplicated, suitable for chip rendering.
 */
export function detectMultiTopic(text: string): MultiTopicDetection {
  if (!text || text.length < 6) return { multiTopic: false, candidates: [] };

  // Skip detection on long messages (>160 chars) — those are conversational
  // and likely contain natural English "and"s that don't enumerate topics.
  // We tighten further than the 240 cap we started with because a single
  // run-on sentence with three "and"s would otherwise trip the heuristic.
  if (text.length > 160) return { multiTopic: false, candidates: [] };

  const stripped = stripFiller(text);
  const parts = splitCandidates(stripped);

  if (parts.length < 3) return { multiTopic: false, candidates: [] };

  // Tighten: every candidate must look topic-shaped (1-5 words). A single
  // candidate that's a full sentence drops the whole detection — that's
  // somebody saying "X, because Y, and also Z" which is one topic with
  // explanation, not three.
  const tight = parts.filter((p) => {
    const words = p.split(/\s+/).filter(Boolean);
    return words.length >= 1 && words.length <= 5;
  });
  if (tight.length < 3) return { multiTopic: false, candidates: [] };

  // Dedupe (case-insensitive), sanity-bounded — see MAX_CANDIDATES.
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of tight) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length < 3) return { multiTopic: false, candidates: [] };

  return { multiTopic: true, candidates };
}

/**
 * Conversation-position gate for the multi-topic refusal (dogfood
 * 2026-06-11). Scope-creep is an INTAKE phenomenon — the detector's own
 * design intent. Past the first user turn, the config agent solicits
 * comma-separated lists by design (Phase 2: "Name 2-5 companies", day
 * picks, keywords), so a list answer is an entity enumeration, not
 * competing topics. Refusing it blocks the agent's own happy path.
 *
 * Both surfaces MUST call this wrapper (client `onSubmit`, server mirror
 * in /api/chat) so the gate cannot drift between them:
 *  - client: `priorUserTurns` = user-role messages already in the thread
 *  - server: count of persisted user rows BEFORE the current one
 */
export function detectMultiTopicIntake(
  text: string,
  priorUserTurns: number
): MultiTopicDetection {
  if (priorUserTurns > 0) return { multiTopic: false, candidates: [] };
  return detectMultiTopic(text);
}

/**
 * Canonical refusal copy. Kept here so the test, the client interceptor,
 * and the server mirror in /api/chat all agree on the exact text.
 */
export const MULTI_TOPIC_REFUSAL =
  "One topic per brief works best — which one first?";
