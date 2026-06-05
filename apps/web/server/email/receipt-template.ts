/**
 * Stream E #10 — receipt email template (PM audit M7).
 *
 * Pure function. NOT wired to a sender yet — the Stripe webhook handler
 * is blocked on Stripe MY KYC. When the webhook lands, the wiring is one
 * line:
 *
 *   const { subject, html, text } = renderReceiptEmail({...});
 *   await sendEmail({ to: user.email, subject, html, text });
 *
 * MY SMEs reimburse business expenses; without a receipt they can't
 * renew. Snapshot tests guarantee the four pack receipts stay stable as
 * brand copy evolves — if a snapshot diff lands, it's intentional.
 *
 * Positioning: copy MUST NOT lead with Telegram (see
 * feedback_cadence_positioning). Channel is mentioned only in passing —
 * "your favourite messaging app".
 */

import { PACK_LABELS, type PackId } from "@/server/billing/packs";
import { getBrandHost, getBrandUrl } from "@/server/support/contact";

export interface ReceiptInput {
  packId: PackId;
  creditsAdded: number;
  amountUsd: number; // dollars, e.g. 10 for $10
  amountMyr: number; // ringgit, e.g. 47 for RM 47
  txDate: Date | string;
  txId: string;
}

export interface ReceiptOutput {
  subject: string;
  html: string;
  text: string;
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)} USD`;
}

function fmtMyr(n: number): string {
  return `RM ${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

const TAGLINE =
  "A senior market researcher in your inbox — for a fraction of the cost.";

export function renderReceiptEmail(input: ReceiptInput): ReceiptOutput {
  const packLabel = PACK_LABELS[input.packId];
  const dateStr = fmtDate(input.txDate);
  const subject = `Receipt — ${packLabel} pack (${input.creditsAdded} credits) — Cadence`;

  const text = [
    `Cadence — receipt`,
    ``,
    `Thanks for topping up. Your credits are live and ready to spend on your next brief.`,
    ``,
    `Pack:            ${packLabel}`,
    `Credits added:   ${input.creditsAdded}`,
    `Amount charged:  ${fmtUsd(input.amountUsd)} (${fmtMyr(input.amountMyr)})`,
    `Date:            ${dateStr} (MYT)`,
    `Transaction ID:  ${input.txId}`,
    ``,
    `One credit = one brief delivered to your favourite messaging app.`,
    ``,
    `Need a tax invoice or to update billing details? Reply to this email.`,
    ``,
    `— Cadence`,
    `${TAGLINE}`,
    getBrandHost(),
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px 8px 28px;">
              <div style="font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">Cadence</div>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#0a0a0a;">Receipt</h1>
              <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#374151;">Thanks for topping up. Your credits are live and ready to spend on your next brief.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;">
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Pack</td>
                  <td style="padding:10px 16px;font-size:13px;color:#0a0a0a;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:500;">${escapeHtml(packLabel)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Credits added</td>
                  <td style="padding:10px 16px;font-size:13px;color:#0a0a0a;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:500;">${input.creditsAdded}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Amount charged</td>
                  <td style="padding:10px 16px;font-size:13px;color:#0a0a0a;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:500;">${escapeHtml(fmtUsd(input.amountUsd))} <span style="color:#6b7280;font-weight:400;">(${escapeHtml(fmtMyr(input.amountMyr))})</span></td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Date</td>
                  <td style="padding:10px 16px;font-size:13px;color:#0a0a0a;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:500;">${escapeHtml(dateStr)} MYT</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#6b7280;">Transaction ID</td>
                  <td style="padding:10px 16px;font-size:12px;color:#0a0a0a;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(input.txId)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">One credit = one brief delivered to your favourite messaging app. Need a tax invoice or to update billing details? Just reply to this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#fafafa;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;"><strong style="color:#0a0a0a;">Cadence</strong> — ${escapeHtml(TAGLINE)}</p>
              <p style="margin:6px 0 0;font-size:12px;color:#6b7280;"><a href="${getBrandUrl()}" style="color:#0a0a0a;text-decoration:none;">${getBrandHost()}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
