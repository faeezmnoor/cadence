/**
 * Slack channel adapter — SCAFFOLDING (CAD-207).
 *
 * `format()` is real: it splits under `chat.postMessage`'s text limit
 * and passes the shared invariant suite. `send()` throws — there is no
 * Slack app / bot token integration yet (gated on demand; ICP-2 B2B
 * operators prefer Slack).
 *
 * When wiring for real: `chat.postMessage` text accepts up to 40,000
 * chars but Slack truncates rendering well below that; mrkdwn dialect
 * differs from markdown (*bold*, <url|label> links) — `format()` will
 * need a dialect pass at that point.
 */
import { splitMarkdown } from "../split";
import type {
  ChannelAdapter,
  ChannelInvariants,
  ChannelTarget,
  ComposedBrief,
  FormatOptions,
} from "../types";

export interface SlackPart {
  text: string;
}

export interface SlackTarget extends ChannelTarget {
  channel: "slack";
  /** Slack channel or DM id, e.g. "C0123456789". */
  channelId: string;
}

export interface SlackReceipt {
  /** Slack message timestamp id ("ts"). */
  ts: string;
}

export const SLACK_INVARIANTS: ChannelInvariants = {
  /** chat.postMessage hard text limit. */
  hardCap: 40_000,
  /** Stay readable — Slack collapses long messages aggressively. */
  softCap: 36_000,
  label: "Slack",
};

function format(brief: ComposedBrief, _opts: FormatOptions = {}): SlackPart[] {
  return splitMarkdown(brief.markdown, SLACK_INVARIANTS.softCap).map(
    (text) => ({ text })
  );
}

async function send(
  _part: SlackPart,
  _target: SlackTarget
): Promise<SlackReceipt> {
  throw new Error(
    "Slack adapter is scaffolding (CAD-207) — no Slack app integration " +
      "yet. Gated on demand; see channel-adapter-architecture.md."
  );
}

function partText(part: SlackPart): string {
  return part.text;
}

export const slackAdapter: ChannelAdapter<
  SlackPart,
  SlackTarget,
  SlackReceipt
> = {
  channel: "slack",
  invariants: SLACK_INVARIANTS,
  format,
  send,
  partText,
};
