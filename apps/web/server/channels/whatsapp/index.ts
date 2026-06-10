/**
 * WhatsApp channel adapter — SCAFFOLDING (CAD-207).
 *
 * `format()` is real: it splits at WhatsApp Cloud API's text-message cap
 * and passes the shared invariant suite, so composer output is provably
 * deliverable the day the vendor integration lands. `send()` throws —
 * there is no Meta Cloud API integration yet (gated on demand; WhatsApp
 * is first in line per validated ICP-1 channel preference).
 *
 * When wiring for real: Meta Cloud API `messages` endpoint, text body
 * limit 4096 chars. WhatsApp's dialect marks bold with single asterisks
 * and italic with underscores (not Telegram's double-asterisk bold) —
 * `format()` will need a dialect pass at that point.
 */
import { splitMarkdown } from "../split";
import type {
  ChannelAdapter,
  ChannelInvariants,
  ChannelTarget,
  ComposedBrief,
  FormatOptions,
} from "../types";

export interface WhatsAppPart {
  text: string;
}

export interface WhatsAppTarget extends ChannelTarget {
  channel: "whatsapp";
  /** E.164 phone number, e.g. "+60123456789". */
  phoneE164: string;
}

export interface WhatsAppReceipt {
  messageId: string;
}

export const WHATSAPP_INVARIANTS: ChannelInvariants = {
  /** Meta Cloud API text-message body limit. */
  hardCap: 4096,
  softCap: 3800,
  label: "WhatsApp",
};

function format(brief: ComposedBrief, _opts: FormatOptions = {}): WhatsAppPart[] {
  return splitMarkdown(brief.markdown, WHATSAPP_INVARIANTS.softCap).map(
    (text) => ({ text })
  );
}

async function send(
  _part: WhatsAppPart,
  _target: WhatsAppTarget
): Promise<WhatsAppReceipt> {
  throw new Error(
    "WhatsApp adapter is scaffolding (CAD-207) — no Meta Cloud API " +
      "integration yet. Gated on demand; see channel-adapter-architecture.md."
  );
}

function partText(part: WhatsAppPart): string {
  return part.text;
}

export const whatsappAdapter: ChannelAdapter<
  WhatsAppPart,
  WhatsAppTarget,
  WhatsAppReceipt
> = {
  channel: "whatsapp",
  invariants: WHATSAPP_INVARIANTS,
  format,
  send,
  partText,
};
