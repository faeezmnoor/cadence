/**
 * T-303: error sanitization + retry classification for the digest pipeline.
 *
 * Two responsibilities:
 *
 *   1. sanitizeError(err) — produce a short, PII-stripped string safe to
 *      persist in digest_runs.last_error and to surface in the (future)
 *      admin runs viewer (T-304). The raw error may contain:
 *        - the user's email (Resend / Supabase errors)
 *        - the user's Telegram chat_id (grammy errors)
 *        - bearer tokens / API keys (when an upstream client formats the
 *          request URL into its error message)
 *        - multi-page stack traces
 *      None of that belongs in a database row that an admin will read at
 *      a glance, and none of it helps the retry decision. We keep the
 *      classifier signal (4xx vs 5xx, network vs HTTP) and drop everything
 *      else.
 *
 *   2. classifyError(err) — decide retryable vs permanent. The retry path
 *      is owned by Inngest's native function-level `retries` so we don't
 *      run a second retry framework on top — this helper just tells the
 *      Inngest handler whether to throw (let Inngest retry) or to mark
 *      the user `delivery_broken` and bail.
 *
 *      Retryable:
 *        - any HTTP 5xx (Telegram, Resend, Anthropic, Brave)
 *        - HTTP 429 (rate-limited; Inngest backoff is the right tool)
 *        - network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, fetch failed)
 *        - generic Error with no HTTP status (assume transient — we'd
 *          rather over-retry than silently swallow)
 *
 *      Permanent (will NOT retry):
 *        - HTTP 4xx other than 429 (bad chat_id, deactivated user, blocked
 *          bot, bad request — retrying makes it worse)
 *        - explicit "bot was blocked by the user" Telegram code (403)
 *        - explicit "chat not found" (400)
 *
 * Both helpers are pure — no DB, no I/O — so they're trivial to unit-test.
 */

const MAX_LEN = 200;

// Patterns we redact. Order matters: longer/more-specific first so they
// don't get partially eaten by a less-specific match.
const REDACTIONS: Array<[RegExp, string]> = [
  // Bearer tokens / API keys (sk-*, pk-*, Bearer xxx, ?token=xxx, &key=xxx)
  [/\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi, "Bearer [REDACTED]"],
  [/\b(sk|pk|rk|api|key|token|secret)[-_][A-Za-z0-9]{12,}/gi, "[REDACTED_KEY]"],
  [/([?&](?:token|key|api[_-]?key|access[_-]?token|auth)=)[^&\s"']+/gi, "$1[REDACTED]"],
  // Emails
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  // UUIDs
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "[uuid]",
  ],
  // Telegram chat_ids — long-form numeric (>=8 digits, often negative for groups)
  [/\b-?\d{8,}\b/g, "[id]"],
];

/**
 * Reduce an arbitrary thrown value to a single short, PII-free line that's
 * safe to write to `digest_runs.last_error`.
 */
export function sanitizeError(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    raw = err.message || err.name || "Error";
  } else if (typeof err === "string") {
    raw = err;
  } else if (err && typeof err === "object") {
    // Common API client shape: { status, message, body, ... }
    const obj = err as { message?: unknown; statusText?: unknown; code?: unknown };
    raw =
      (typeof obj.message === "string" && obj.message) ||
      (typeof obj.statusText === "string" && obj.statusText) ||
      (typeof obj.code === "string" && obj.code) ||
      "Error";
  } else {
    raw = String(err);
  }

  // Strip newlines / tabs — keep it one line for log + DB friendliness.
  let s = raw.replace(/[\r\n\t]+/g, " ").trim();

  for (const [pattern, replacement] of REDACTIONS) {
    s = s.replace(pattern, replacement);
  }

  // Collapse runs of whitespace introduced by redactions.
  s = s.replace(/\s{2,}/g, " ").trim();

  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN - 1) + "…";
  }

  return s || "Error";
}

export type ErrorClass = "transient" | "permanent";

interface MaybeHttpError {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  cause?: unknown;
  error_code?: unknown;
  description?: unknown;
}

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as MaybeHttpError;
  const candidates = [e.status, e.statusCode, e.error_code];
  for (const c of candidates) {
    if (typeof c === "number" && c >= 100 && c < 600) return c;
    if (typeof c === "string" && /^\d{3}$/.test(c)) return Number(c);
  }
  // grammy nests: HttpError { error_code, description }
  if (e.cause && typeof e.cause === "object") {
    return extractStatus(e.cause);
  }
  return null;
}

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const PERMANENT_TELEGRAM_PHRASES = [
  "bot was blocked",
  "chat not found",
  "user is deactivated",
  "bot was kicked",
  "have no rights",
];

/**
 * Decide whether the dispatcher should retry this error (transient) or
 * give up and flip the user to delivery_broken (permanent).
 *
 * Default bias: when in doubt, return "transient". A wrongly-retried error
 * costs us one extra Inngest run; a wrongly-permanent error breaks a real
 * user's digest silently.
 */
export function classifyError(err: unknown): ErrorClass {
  const status = extractStatus(err);
  if (status !== null) {
    if (status === 429) return "transient";
    if (status >= 500) return "transient";
    if (status >= 400) {
      // Drill into the body once to catch grammy "bot was blocked" 403s
      // explicitly. They're permanent — retry won't unblock the bot.
      const msg = (err && typeof err === "object" && "description" in err
        ? String((err as { description?: unknown }).description ?? "")
        : err instanceof Error
          ? err.message
          : ""
      ).toLowerCase();
      if (PERMANENT_TELEGRAM_PHRASES.some((p) => msg.includes(p))) {
        return "permanent";
      }
      return "permanent";
    }
  }

  // Network errors carried on Node Error.code
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: unknown }).code ?? "");
    if (NETWORK_CODES.has(code)) return "transient";
  }

  // fetch() failures bubble up as TypeError("fetch failed") with cause.
  if (err instanceof Error && /fetch failed|network|socket|timeout/i.test(err.message)) {
    return "transient";
  }

  return "transient";
}
