/**
 * Strip chip/tool JSON leaks from an assistant text turn.
 *
 * Wave 5 Bug 12 (P0): gpt-4o-mini sometimes embeds the `suggest_quick_replies`
 * payload as text inside its free-prose response — either at the end of the
 * message ("...let me know! [\"Daily\",\"Weekly\",\"Monthly\"]") or as a
 * trailing JSON object ({"chips":[...]}). The chip strip below the bubble is
 * the only legitimate render surface; the JSON in the bubble body is a UX
 * regression. We scrub it server-side before persist AND on the client at
 * render time (belt-and-suspenders for already-stored messages).
 *
 * Pure, no side effects, no LLM call. Conservative: if the text doesn't
 * match any of the known leak shapes, it is passed through unchanged.
 */

const CHIP_KEY_PATTERN = /"chips"\s*:\s*\[/;
const QUICK_REPLY_CALL_PATTERN =
  /suggest_quick_replies\s*\(\s*\{[\s\S]*?\}\s*\)\s*\.?/gi;
const TRAILING_JSON_ARRAY_OF_STRINGS =
  /(?:^|\n|\s)\[\s*(?:"[^"\\]{1,40}"\s*,\s*){1,5}"[^"\\]{1,40}"\s*\]\s*\.?\s*$/;
const TRAILING_JSON_ARRAY_OF_OBJECTS =
  /(?:^|\n|\s)\[\s*\{[\s\S]{0,800}?\}\s*(?:,\s*\{[\s\S]{0,800}?\}\s*){0,5}\]\s*\.?\s*$/;
const TRAILING_JSON_OBJECT_WITH_CHIPS =
  /(?:^|\n|\s)\{[\s\S]{0,800}?"chips"[\s\S]{0,800}?\}\s*\.?\s*$/;

/**
 * Remove embedded quick-reply chip JSON from a single assistant text payload.
 * Leaves the rest of the prose untouched.
 */
export function stripQuickReplyLeak(text: string): string {
  if (!text || typeof text !== "string") return text ?? "";
  let out = text;

  // 1. Strip stray `suggest_quick_replies({...})` calls anywhere in body.
  out = out.replace(QUICK_REPLY_CALL_PATTERN, "");

  // 2. Strip a trailing JSON-object form that contains "chips": [...].
  if (CHIP_KEY_PATTERN.test(out)) {
    out = out.replace(TRAILING_JSON_OBJECT_WITH_CHIPS, "");
  }

  // 3. Strip trailing JSON-array-of-objects (likely a chips array).
  out = out.replace(TRAILING_JSON_ARRAY_OF_OBJECTS, "");

  // 4. Strip trailing JSON-array-of-short-strings (likely chip labels).
  out = out.replace(TRAILING_JSON_ARRAY_OF_STRINGS, "");

  return out.trimEnd();
}
