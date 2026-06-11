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
 * This runs client-side before the chat round-trip — no LLM cost, no
 * draft pollution. Server is the ultimate gate (config agent prompt
 * already discourages multi-topic) but this catches the loud cases up
 * front and steers them.
 */

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

  // Dedupe (case-insensitive) and cap at 4 chips for UI.
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of tight) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
    if (candidates.length >= 4) break;
  }
  if (candidates.length < 3) return { multiTopic: false, candidates: [] };

  return { multiTopic: true, candidates };
}

/**
 * Canonical refusal copy. Kept here so the test, the client, and any
 * future server-side mirror all agree on the exact text.
 */
export const MULTI_TOPIC_REFUSAL =
  "One topic per brief works best — which one first? I'll focus on the one you pick.";
