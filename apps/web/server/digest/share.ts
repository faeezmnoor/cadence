/**
 * Stream E #6 — per-brief permalink helper.
 *
 * One source of truth for the share URL Stream A's composer will append to
 * the bottom of every delivered brief. Do not duplicate this string in the
 * composer or anywhere else — import from here.
 *
 * Format: `${BASE}/b/<short_id>`. The brief page itself is rendered by
 * `apps/web/app/b/[shortId]/page.tsx`.
 */

/** 12-char nanoid alphabet (URL-safe, no lookalikes-issues acceptable). */
const ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SHORT_ID_LEN = 12;

/**
 * Generate a 12-char random shortId. Not cryptographically strong — the
 * brief is public anyway. ~62^12 = 3.2e21 keyspace, collision probability
 * is negligible for our scale; the DB has a unique partial index as the
 * actual safety net.
 */
export function generateBriefShortId(): string {
  let out = "";
  for (let i = 0; i < SHORT_ID_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Validation regex — `app/b/[shortId]/page.tsx` uses this to reject garbage. */
export const SHORT_ID_RE = /^[a-zA-Z0-9]{12}$/;

export function isValidShortId(id: string): boolean {
  return SHORT_ID_RE.test(id);
}

/**
 * Absolute share URL for a brief. Reads NEXT_PUBLIC_APP_URL when present,
 * falls back to the prod URL. Trailing slashes are stripped so we never
 * produce `//b/<id>`.
 */
export function getBriefShareUrl(shortId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://cadence-web-bice.vercel.app";
  return `${base.replace(/\/+$/, "")}/b/${shortId}`;
}
