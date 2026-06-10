/**
 * Channel adapter registry (CAD-205).
 *
 * Every adapter is added here so the shared invariant test suite can
 * iterate them. Tests import `registeredAdapters` and assert each one
 * passes the contract.
 */
import { telegramAdapter } from "./telegram";
import { whatsappAdapter } from "./whatsapp";
import { emailAdapter } from "./email";
import { slackAdapter } from "./slack";
import type { ChannelAdapter, ChannelTarget } from "./types";

// `any` is deliberate: the registry erases each adapter's part/receipt types
// so the invariant suite can iterate them uniformly.
type AnyAdapter = ChannelAdapter<any, ChannelTarget, any>;

/**
 * Telegram is live; WhatsApp/Email/Slack are scaffolding (CAD-207):
 * `format()` is real and invariant-tested, `send()` throws until the
 * vendor integration lands.
 */
export const registeredAdapters: ReadonlyArray<AnyAdapter> = [
  telegramAdapter,
  whatsappAdapter,
  emailAdapter,
  slackAdapter,
];

export { telegramAdapter, whatsappAdapter, emailAdapter, slackAdapter };
export type {
  ChannelAdapter,
  ChannelTarget,
  ChannelInvariants,
  ChannelName,
  ComposedBrief,
  FormatOptions,
} from "./types";
