/**
 * Single source of truth for human-facing display labels.
 *
 * Background (Wave 5 structural): raw spec/ledger enum keys
 * (`admin_grant`, `executive_brief`, `weekly`, `en`, `archived`, etc.)
 * have been quietly leaking into the UI from multiple surfaces:
 *  - Bug 4 (Wave 4): chip text rendered raw enum keys.
 *  - Bug 14 (Wave 5): ledger row rendered raw `admin_grant`.
 *  - Earlier audits flagged ad-hoc switch/maps living in 3+ files.
 *
 * Every UI render of an enum value MUST route through this module. This
 * keeps wording consistent (one canonical "Executive brief", not two),
 * keeps user surfaces engineer-string-free, and gives a single file to
 * audit when adding a new enum value.
 *
 * Pass-through policy: every `formatX(raw)` falls back to a `prettify`
 * helper that snake_case-strips so an unmapped enum still renders
 * "Some new kind" rather than the engineer key. Callers should add the
 * mapping here when they ship a new enum value.
 */

/** Generic snake_case → Title Case fallback. */
export function prettify(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Delivery channel codes (CAD-12x). */
const CHANNELS: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  email: "Email",
};
export function formatChannel(raw: string): string {
  return CHANNELS[raw] ?? prettify(raw);
}

/** DigestSpec tone presets. */
const TONES: Record<string, string> = {
  executive_brief: "Executive brief",
  analyst_deep_dive: "Analyst deep-dive",
  trader_quick_take: "Trader quick take",
  casual_newsletter: "Casual newsletter",
};
export function formatTone(raw: string): string {
  return TONES[raw] ?? prettify(raw);
}

/** DigestSpec length targets. */
const LENGTHS: Record<string, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
};
export function formatLength(raw: string): string {
  return LENGTHS[raw] ?? prettify(raw);
}

/** ISO language code → display string. */
const LANGUAGES: Record<string, string> = {
  en: "English",
  ms: "Bahasa Malaysia",
  zh: "中文",
};
export function formatLanguage(raw: string): string {
  return LANGUAGES[raw] ?? prettify(raw);
}

/** Cadence frequency. */
const FREQUENCIES: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
export function formatFrequency(raw: string): string {
  return FREQUENCIES[raw] ?? prettify(raw);
}

/**
 * transactions.type — the credit-ledger kind.
 *
 * Wave 5 Bug 14: `admin_grant` was leaking through the billing-history
 * fallback as the raw key. Add every kind written by server/billing/* and
 * server/trpc/routers/admin.ts.
 */
const LEDGER_KINDS: Record<string, string> = {
  trial_grant: "Trial credit grant",
  admin_grant: "Admin credit grant",
  promo: "Promo credit",
  message_send: "Brief delivered",
  charge: "Brief delivered",
  topup: "Top-up",
  auto_topup: "Auto top-up",
  adjustment: "Adjustment",
  refund: "Refund credited",
};
export function formatLedgerKind(raw: string): string {
  return LEDGER_KINDS[raw] ?? prettify(raw);
}

/** digest_specs.status — the brief lifecycle state. */
const BRIEF_STATUSES: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  superseded: "Superseded",
};
export function formatBriefStatus(raw: string): string {
  return BRIEF_STATUSES[raw] ?? prettify(raw);
}

/** digest_runs.status — one run of the digest pipeline. */
const RUN_STATUSES: Record<string, string> = {
  composing: "Composing",
  delivered: "Delivered",
  sent: "Sent",
  failed: "Failed",
  skipped_no_credits: "Skipped — no credits",
};
export function formatRunStatus(raw: string): string {
  return RUN_STATUSES[raw] ?? prettify(raw);
}

/** users.state. */
const USER_STATES: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  delivery_broken: "Delivery broken",
};
export function formatUserState(raw: string): string {
  return USER_STATES[raw] ?? prettify(raw);
}

/**
 * Tier label — uses the marketing wording, NOT the raw enum. The "Pro pack"
 * vs "Pro tier" overload is a known naming hazard; this returns the user-
 * facing "Standard research" / "Advanced research" framing (locked
 * vocabulary — never "Pro"/"Default"/"deep research" as depth names).
 */
// CAD-225: the dominated 'pro' (Sonar A2) depth is retired from the product;
// 'pro_websearch' is the single advanced option, so both map to the same
// unqualified "Advanced research" label. The 'pro' entry stays for any legacy
// row that still surfaces in an admin/history view.
const TIERS: Record<string, string> = {
  default: "Standard research",
  pro: "Advanced research",
  pro_websearch: "Advanced research",
};
export function formatTier(raw: string): string {
  return TIERS[raw] ?? prettify(raw);
}

/**
 * digest_specs.created_via — how a spec version came to exist.
 * Values written today: chat_agent (config-agent confirm_and_save),
 * manual_edit (web /spec editor + briefs router), smoke_seed (dev seed).
 */
const CREATED_VIA: Record<string, string> = {
  chat_agent: "Set up in chat",
  manual_edit: "Edited on web",
  smoke_seed: "Test seed",
};
export function formatCreatedVia(raw: string): string {
  return CREATED_VIA[raw] ?? prettify(raw);
}
