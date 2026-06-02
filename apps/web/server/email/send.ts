/**
 * Minimal Resend HTTP client. Avoids adding the `resend` SDK as a dep —
 * the API is a single POST and we control the failure surface entirely.
 *
 * Behavior:
 *   - RESEND_API_KEY missing  -> log + no-op (returns { sent: false }).
 *     Lets local dev / preview branches run without secrets, and lets
 *     production tolerate a temporary key outage without 500-ing the
 *     calling mutation.
 *   - Resend 4xx              -> throw with sanitized message; caller
 *     decides whether to surface to the user.
 *   - Resend 5xx / network    -> throw; caller should treat as retryable.
 *
 * `from`: defaults to "Cadence <noreply@cadence.news>". Faeez must verify
 * cadence.news in Resend; until then the env override `EMAIL_FROM` can
 * point at a verified sandbox domain.
 */
import { SUPPORT_EMAIL } from "@/server/support/contact";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Cadence <noreply@cadence.news>";

export interface SendEmailParams {
  to: string;
  subject: string;
  /** Plain-text body. We don't ship HTML templates yet — keeps trust + spam score honest. */
  text: string;
  /** Optional override; defaults to SUPPORT_EMAIL so replies land in the inbox we read. */
  replyTo?: string;
}

export interface SendEmailResult {
  sent: boolean;
  id?: string;
  /** Set when sent=false because no key was configured. */
  reason?: "no_resend_key";
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set; skipping send to", params.to);
    return { sent: false, reason: "no_resend_key" };
  }

  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const replyTo = params.replyTo ?? SUPPORT_EMAIL;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      reply_to: replyTo,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Strip any token-shaped strings before logging
    const safeBody = body.replace(/re_[A-Za-z0-9_]+/g, "re_***");
    throw new Error(`Resend ${res.status}: ${safeBody.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: json.id };
}
