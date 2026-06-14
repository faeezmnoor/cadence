/**
 * briefDisplayName — shared brief label resolution (exec RC2 discipline,
 * manage-mode plan §4.7 item 2, Design risk 7).
 *
 * Lifted from the inline `displayName` expression in
 * app/briefs/briefs-client.tsx (name → first topic → "Untitled brief")
 * so the /briefs card and the manage-chat header can never drift. Pure,
 * server-importable. Confined to the function lift — no resolver-adjacent
 * code touched. Outputs pinned in test/brief-display-name.test.ts.
 */

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function briefDisplayName(
  name: string | null | undefined,
  topics: string[]
): string {
  return (
    name?.trim() || (topics[0] ? `${capitalize(topics[0])} brief` : "Untitled brief")
  );
}

/**
 * deriveBriefName — derive the persisted digest_specs.name from a spec
 * (Wave 4 Bug 7; lifted VERBATIM from server/ai/config-agent/save-spec.ts
 * in the manage-mode wave so updateSpecInPlace can recompute the name
 * WITHOUT importing the cap-gated save module — the cap-bypass contract
 * (AC3.2/AC6.1) is asserted by a module-mock test). Same discipline as the
 * other lifts here: no second copy, ever.
 *
 * Prefers a topics[0] capitalized name; falls back to the generic label.
 */
export function deriveBriefName(spec: { topics?: string[] }): string {
  const t0 = spec.topics?.[0];
  if (typeof t0 === "string" && t0.trim().length > 0) {
    const trimmed = t0.trim();
    const head = trimmed[0]!.toUpperCase() + trimmed.slice(1);
    return `${head} brief`;
  }
  return "Untitled brief";
}
