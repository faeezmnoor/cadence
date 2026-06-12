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
