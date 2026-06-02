// T-502a: Seed initial pricing_snapshots rows for the four credit packs.
//
// Pack ladder LOCKED 2026-06-02:
//   Taste     $5    30 credits   RM23
//   Standard  $10   70 credits   RM47   (best-value)
//   Power     $25   200 credits  RM118
//   Pro       $100  1000 credits RM470
//
// MYR rounding rule: nearest RM 0.50 (B-8).
// FX snapshot: USD 1 = MYR 4.70 (2026-06-02 indicative; snapshotted at
//   sale time so future receipts always reconcile against the active row).
// COGS estimate: ~$0.005 per brief = 5000 micro-USD.
//
// IMPORTANT: this .mjs file is the standalone seed runner; it deliberately
// inlines the pack constants because it runs under raw node (no TS). The
// authoritative source for the FE/test/prod code path is
// `apps/web/server/billing/packs.ts`. Both files MUST stay in sync.
//
// Idempotency: re-run-safe. For each pack we check whether an active row
// (active_to IS NULL) already exists. If yes, skip. If no, insert.
//
// Usage:
//   cd apps/web && node --env-file=.env.local server/db/seed-pricing-snapshots.mjs

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL not set. Run with: node --env-file=.env.local server/db/seed-pricing-snapshots.mjs"
  );
  process.exit(1);
}

// MUST mirror apps/web/server/billing/packs.ts.
const PACKS = [
  { packId: "taste", credits: 30, priceMinorUsd: 500, priceMinorMyr: 2300 },
  { packId: "standard", credits: 70, priceMinorUsd: 1000, priceMinorMyr: 4700 },
  { packId: "power", credits: 200, priceMinorUsd: 2500, priceMinorMyr: 11800 },
  { packId: "pro", credits: 1000, priceMinorUsd: 10000, priceMinorMyr: 47000 },
];

const FX_USD_TO_MYR = "4.700000"; // USD 1 = MYR 4.70 snapshot
const COST_TO_US_MICRO_PER_CREDIT = 5000;

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

try {
  console.log("[seed-pricing] checking existing active snapshots ...");
  const existing = await sql`
    SELECT pack_id FROM pricing_snapshots WHERE active_to IS NULL
  `;
  const existingPacks = new Set(existing.map((r) => r.pack_id));
  console.log(
    `[seed-pricing] ${existing.length} active rows: ${[...existingPacks].sort().join(", ") || "(none)"}`
  );

  let inserted = 0;
  for (const p of PACKS) {
    if (existingPacks.has(p.packId)) {
      console.log(`[seed-pricing] skip ${p.packId} — active row exists`);
      continue;
    }
    await sql`
      INSERT INTO pricing_snapshots
        (pack_id, credits, price_minor_usd, price_minor_myr,
         fx_rate_usd_to_myr, cost_to_us_micro_per_credit)
      VALUES
        (${p.packId}, ${p.credits}, ${p.priceMinorUsd}, ${p.priceMinorMyr},
         ${FX_USD_TO_MYR}, ${COST_TO_US_MICRO_PER_CREDIT})
    `;
    console.log(
      `[seed-pricing] inserted ${p.packId}: ${p.credits} credits, ` +
        `$${(p.priceMinorUsd / 100).toFixed(2)} / RM${(p.priceMinorMyr / 100).toFixed(2)}`
    );
    inserted++;
  }

  const final = await sql`
    SELECT pack_id, credits, price_minor_usd, price_minor_myr
    FROM pricing_snapshots WHERE active_to IS NULL ORDER BY price_minor_usd
  `;
  console.log(`[seed-pricing] done — ${inserted} new row(s); ${final.length} packs active:`);
  for (const r of final) {
    console.log(
      `  - ${r.pack_id}: ${r.credits} credits ` +
        `$${(r.price_minor_usd / 100).toFixed(2)} / RM${(r.price_minor_myr / 100).toFixed(2)}`
    );
  }
} catch (err) {
  console.error("[seed-pricing] FAILED", err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
