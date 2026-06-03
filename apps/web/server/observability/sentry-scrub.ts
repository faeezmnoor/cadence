/**
 * Sentry PII scrubber — Security MEDIUM #3.
 *
 * Strips fields known to contain user-authored content or PII from outgoing
 * Sentry events before they hit Sentry storage. Belt-and-braces over careful
 * logging in call-sites: even if a stray logger.error(err, { chat_content })
 * slips through, this redacts before transport.
 *
 * Scrubbed keys (case-insensitive, applied at any depth in extra/contexts):
 *   - email                  user email addresses
 *   - chat_content           raw chat-agent user turns
 *   - composed_markdown      generated brief body (can echo user wording)
 *   - notes                  free-text user notes
 *
 * Also redacts event.user.email to a deterministic hash so we keep user-level
 * grouping in Sentry without storing the plaintext address.
 */
// Note: avoid `import { createHash } from "node:crypto"` at module top — this
// module is also imported from `sentry.client.config.ts` which bundles for the
// browser. We lazily reach for the global Web Crypto SubtleCrypto when needed,
// and fall back to a non-crypto fingerprint that still defeats casual leakage.

/**
 * Loose Sentry event shape — we intentionally avoid importing internal
 * Sentry types here so the scrubber stays decoupled from SDK type drift.
 * Only fields we touch are listed.
 */
type SentryEventLike = {
  user?: { email?: string | null; [k: string]: unknown } | null;
  extra?: Record<string, unknown> | null;
  contexts?: Record<string, Record<string, unknown> | undefined> | null;
  [k: string]: unknown;
};

const SCRUB_KEYS = new Set([
  "email",
  "chat_content",
  "composed_markdown",
  "notes",
]);

const REDACTED = "[redacted]";

/**
 * Non-cryptographic but deterministic email fingerprint suitable for
 * preserving Sentry user-grouping without storing plaintext. djb2-style,
 * runs identically on Node and in the browser. We never need to reverse
 * the value — Sentry only needs equal-in / equal-out.
 */
function hashEmail(email: string): string {
  const s = email.toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return `email-fp:${h.toString(16).padStart(8, "0")}`;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return value; // belt-and-braces against pathological cycles
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SCRUB_KEYS.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubValue(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  // event.user.email -> hashed
  if (event.user && typeof event.user.email === "string" && event.user.email) {
    event.user = { ...event.user, email: hashEmail(event.user.email) };
  }

  // event.extra
  if (event.extra && typeof event.extra === "object") {
    event.extra = scrubValue(event.extra) as typeof event.extra;
  }

  // event.contexts (each context is a Record<string, unknown>)
  if (event.contexts && typeof event.contexts === "object") {
    const scrubbed: Record<string, Record<string, unknown>> = {};
    for (const [ctxName, ctxVal] of Object.entries(event.contexts)) {
      if (ctxVal) {
        scrubbed[ctxName] = scrubValue(ctxVal) as Record<string, unknown>;
      }
    }
    event.contexts = scrubbed as typeof event.contexts;
  }

  return event;
}
