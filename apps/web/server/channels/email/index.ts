/**
 * Email channel adapter — SCAFFOLDING (CAD-207).
 *
 * `format()` is real: email has no meaningful vendor part cap, so the
 * caps are generous and a brief is virtually always a single part —
 * but the invariant suite still holds (no oversized part, no dropped
 * citations). `send()` throws — there is no Resend-send integration for
 * briefs yet (gated on demand; ICP-3 solo advisors prefer email).
 *
 * When wiring for real: Resend is already in the stack for magic links
 * (`RESEND_API_KEY`), so delivery is an API call away — the real work
 * is markdown→HTML rendering and the unsubscribe/compliance footer.
 */
import { splitMarkdown } from "../split";
import type {
  ChannelAdapter,
  ChannelInvariants,
  ChannelTarget,
  ComposedBrief,
  FormatOptions,
} from "../types";

export interface EmailPart {
  text: string;
}

export interface EmailTarget extends ChannelTarget {
  channel: "email";
  to: string;
}

export interface EmailReceipt {
  messageId: string;
}

export const EMAIL_INVARIANTS: ChannelInvariants = {
  /** No vendor cap in practice; bounded so the invariant suite has teeth. */
  hardCap: 100_000,
  softCap: 80_000,
  label: "Email",
};

function format(brief: ComposedBrief, _opts: FormatOptions = {}): EmailPart[] {
  return splitMarkdown(brief.markdown, EMAIL_INVARIANTS.softCap).map(
    (text) => ({ text })
  );
}

async function send(
  _part: EmailPart,
  _target: EmailTarget
): Promise<EmailReceipt> {
  throw new Error(
    "Email adapter is scaffolding (CAD-207) — no brief-delivery " +
      "integration yet. Gated on demand; see channel-adapter-architecture.md."
  );
}

function partText(part: EmailPart): string {
  return part.text;
}

export const emailAdapter: ChannelAdapter<
  EmailPart,
  EmailTarget,
  EmailReceipt
> = {
  channel: "email",
  invariants: EMAIL_INVARIANTS,
  format,
  send,
  partText,
};
