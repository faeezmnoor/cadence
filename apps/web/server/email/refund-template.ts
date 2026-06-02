/**
 * Apology + refund-confirmation email body. Plain text on purpose —
 * Cadence's voice is short, founder-honest, no HTML chrome.
 *
 * Called by admin.refundRun after an admin marks a failed delivery for
 * refund. The refund row in `transactions` is the source of truth; this
 * email just tells the user what happened.
 */
import { SUPPORT_EMAIL } from "@/server/support/contact";

export interface RefundEmailParams {
  /** Date of the missed brief, formatted human-readably e.g. "2 Jun 2026". */
  runDate: string;
  /** Post-refund balance, for the user's reassurance. */
  balanceAfter: number;
  /** Optional admin note that gets quoted back to the user. */
  reason?: string;
}

export function buildRefundEmail(params: RefundEmailParams): {
  subject: string;
  text: string;
} {
  const { runDate, balanceAfter, reason } = params;
  const lines: string[] = [
    "Hi,",
    "",
    `Your Cadence brief for ${runDate} didn't make it to you. That's on us.`,
    "",
    "We've returned the credit to your account. Your balance is now",
    `${balanceAfter} credit${balanceAfter === 1 ? "" : "s"}.`,
  ];
  if (reason && reason.trim().length > 0) {
    lines.push("", `What happened: ${reason.trim()}`);
  }
  lines.push(
    "",
    "Your next scheduled brief should land as normal. If it doesn't, or if",
    `you'd rather a cash refund of unused credits, reply to this email — ${SUPPORT_EMAIL}.`,
    "",
    "Sorry for the gap.",
    "— Faeez, Cadence"
  );
  return {
    subject: `Brief missed on ${runDate} — credit refunded`,
    text: lines.join("\n"),
  };
}
