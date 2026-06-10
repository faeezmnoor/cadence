/**
 * Stream E #10 — receipt email template snapshots, one per pack.
 *
 * When Stripe webhook lands and we call renderReceiptEmail(), these
 * snapshots fail loudly if copy drifts. Snapshot diffs should be
 * deliberate and reviewed.
 */
import { describe, expect, it } from "vitest";
import { renderReceiptEmail } from "@/server/email/receipt-template";
import type { PackId } from "@/server/billing/packs";

const FIXED_DATE = new Date("2026-06-02T03:00:00.000Z"); // 11:00 MYT

const FIXTURES: Array<{ packId: PackId; credits: number; usd: number; myr: number }> = [
  { packId: "taste", credits: 30, usd: 5, myr: 23 },
  { packId: "standard", credits: 70, usd: 10, myr: 47 },
  { packId: "power", credits: 200, usd: 25, myr: 118 },
  { packId: "pro", credits: 1000, usd: 100, myr: 470 },
];

describe("Stream E #10 — renderReceiptEmail (per pack)", () => {
  for (const f of FIXTURES) {
    describe(f.packId, () => {
      const out = renderReceiptEmail({
        packId: f.packId,
        creditsAdded: f.credits,
        amountUsd: f.usd,
        amountMyr: f.myr,
        txDate: FIXED_DATE,
        txId: `txn_${f.packId}_snapshot`,
      });

      it("subject matches snapshot", () => {
        expect(out.subject).toMatchSnapshot();
      });
      it("plain text matches snapshot", () => {
        expect(out.text).toMatchSnapshot();
      });
      it("html matches snapshot", () => {
        expect(out.html).toMatchSnapshot();
      });
    });
  }

  it("text body includes credit count and pack label", () => {
    const out = renderReceiptEmail({
      packId: "standard",
      creditsAdded: 70,
      amountUsd: 10,
      amountMyr: 47,
      txDate: FIXED_DATE,
      txId: "txn_test",
    });
    expect(out.text).toContain("70");
    expect(out.text).toContain("Everyday");
    expect(out.text).toContain("txn_test");
  });

  it("never leads with Telegram in copy (positioning rule)", () => {
    const out = renderReceiptEmail({
      packId: "taste",
      creditsAdded: 30,
      amountUsd: 5,
      amountMyr: 23,
      txDate: FIXED_DATE,
      txId: "txn_test",
    });
    // Telegram should not appear in the receipt copy at all — channel-agnostic
    // framing per feedback_cadence_positioning.
    expect(out.text.toLowerCase()).not.toContain("telegram");
    expect(out.html.toLowerCase()).not.toContain("telegram");
  });

  it("html escapes the txId", () => {
    const out = renderReceiptEmail({
      packId: "taste",
      creditsAdded: 30,
      amountUsd: 5,
      amountMyr: 23,
      txDate: FIXED_DATE,
      txId: "<script>alert(1)</script>",
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;");
  });
});
