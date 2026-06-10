/**
 * Channel adapter interface — Cadence outbound message abstraction.
 *
 * Every outbound user-facing message MUST pass through a `ChannelAdapter`.
 * Channel-specific concerns (size limits, dialect, escape rules, native
 * affordances) are isolated to the adapter. Business logic NEVER calls a
 * vendor SDK directly.
 *
 * Owner: cadence/blueprint/channel-adapter-architecture.md (CAD-205).
 *
 * `format()` is pure (no I/O), splits to N parts each respecting the channel
 * hard cap. `send()` does I/O only. This separation makes the splitter
 * testable in isolation and the send retry-safe.
 */

export type ChannelName = "telegram" | "whatsapp" | "email" | "slack" | "sms";

/**
 * Channel-agnostic intermediate representation of a brief. Composers produce
 * this once; each adapter renders it into channel-native form.
 *
 * For PR #12 (CAD-205) only the `markdown` field is required — composers
 * already emit a single markdown blob. The richer fields land in PR #12b
 * when WhatsApp / Email / Slack adapters need section-level rendering.
 */
export interface ComposedBrief {
  /** Channel-agnostic markdown body. */
  markdown: string;
  /** Optional structured sections (reserved for future adapter use). */
  sections?: ReadonlyArray<{ heading: string; body: string }>;
  /** Optional source citations (reserved for future adapter use). */
  sources?: ReadonlyArray<{ id: number; title: string; url: string }>;
}

export interface FormatOptions {
  /**
   * If true the adapter should attach native affordances (e.g. Telegram
   * inline keyboard) to the final part. Currently honored by the Telegram
   * adapter via a separate keyboard helper; the flag exists in the type
   * so future adapters can opt in uniformly.
   */
  withFeedbackAffordances?: boolean;
}

/**
 * Channel destination. Each channel narrows this via its own adapter target
 * type — e.g. Telegram = `{ chatId: number }`, Email = `{ to: string }`.
 */
export interface ChannelTarget {
  channel: ChannelName;
}

export interface ChannelInvariants {
  /** Absolute maximum part size in characters (vendor limit). */
  hardCap: number;
  /** Soft cap used by the splitter to leave headroom. */
  softCap: number;
  /** Display label for tests + admin UI. */
  label: string;
}

/**
 * The contract every adapter implements.
 *
 *   - `format(brief, opts)` → array of channel-native parts, pure, no I/O.
 *   - `send(part, target)` → fires one vendor API call, returns a receipt.
 *
 * `TPart` and `TReceipt` are channel-specific so the type system pins each
 * adapter's data shape end-to-end.
 */
export interface ChannelAdapter<TPart, TTarget extends ChannelTarget, TReceipt> {
  channel: ChannelName;
  invariants: ChannelInvariants;
  format(brief: ComposedBrief, opts?: FormatOptions): TPart[];
  send(part: TPart, target: TTarget): Promise<TReceipt>;
  /** Extract the user-visible text from a part (for invariant testing). */
  partText(part: TPart): string;
}
