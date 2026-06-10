/**
 * T-502a: Credit pack constants — single source of truth.
 *
 * The DB row (pricing_snapshots) is authoritative for ACTUAL charges and
 * for receipts: every transaction.pricing_snapshot_id reconciles against
 * the row that was active at sale time. These constants exist so:
 *
 *   - the FE can render pack cards before fetching any data (T-504a),
 *   - tests can assert ladder shape without hitting Postgres,
 *   - the seed script imports the same ladder, so the DB and code agree.
 *
 * If the ladder ever changes, edit this file + add a new row in
 * pricing_snapshots (UPDATE prior row's active_to first). Do NOT mutate
 * existing rows — receipts must always re-reconcile.
 *
 * Locked decisions (Faeez, 2026-06-02):
 *   - 4 packs: taste / standard / power / pro
 *   - $5/$10/$25/$100 USD → 30/70/200/1000 credits
 *   - MYR rounded to nearest RM 0.50 (B-8)
 *   - 3 free trial credits (T-506a)
 */

export type PackId = "taste" | "standard" | "power" | "pro";

export interface Pack {
  packId: PackId;
  credits: number;
  /** Cents USD. Source of truth for charging. */
  priceMinorUsd: number;
  /** Sen MYR. Display value for MY users. */
  priceMinorMyr: number;
  /** Hint string for UI highlight. Only "standard" has "best_value" in v1. */
  highlight?: "best_value";
}

export const PACKS: ReadonlyArray<Pack> = [
  { packId: "taste", credits: 30, priceMinorUsd: 500, priceMinorMyr: 2300 },
  {
    packId: "standard",
    credits: 70,
    priceMinorUsd: 1000,
    priceMinorMyr: 4700,
    highlight: "best_value",
  },
  { packId: "power", credits: 200, priceMinorUsd: 2500, priceMinorMyr: 11800 },
  { packId: "pro", credits: 1000, priceMinorUsd: 10000, priceMinorMyr: 47000 },
] as const;

/** Display labels — kept here so FE imports a single module. */
export const PACK_LABELS: Record<PackId, string> = {
  taste: "Taste",
  standard: "Everyday",
  power: "Power",
  pro: "Max",
};

/** Trial credit grant count (B-7 locked at 3). */
export const TRIAL_CREDITS = 3;

/** FX snapshot for the v1 ladder (1 USD = 4.70 MYR). */
export const FX_USD_TO_MYR_V1 = 4.7;

/**
 * Per-credit cost-to-us estimate at v1 launch.
 * Stored as micro-USD (1e-6 USD) on pricing_snapshots and transactions.
 * 5000 micro-USD = $0.005 / brief — Haiku 4.5 + Brave + RSS pull, padded.
 */
export const COST_TO_US_MICRO_PER_CREDIT_V1 = 5000;

export function getPack(packId: PackId): Pack {
  const p = PACKS.find((p) => p.packId === packId);
  if (!p) throw new Error(`Unknown pack: ${packId}`);
  return p;
}

/**
 * Pretty per-credit display for marketing copy.
 *   taste:    $0.167 / credit
 *   standard: $0.143 / credit
 *   power:    $0.125 / credit
 *   pro:      $0.10  / credit
 */
export function perCreditUsdMinor(pack: Pack): number {
  return pack.priceMinorUsd / pack.credits;
}
