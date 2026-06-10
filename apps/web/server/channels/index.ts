/**
 * Channel adapter registry (CAD-205).
 *
 * Every adapter is added here so the shared invariant test suite can
 * iterate them. Tests import `registeredAdapters` and assert each one
 * passes the contract.
 */
import { telegramAdapter } from "./telegram";
import type { ChannelAdapter, ChannelTarget } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdapter = ChannelAdapter<any, ChannelTarget, any>;

export const registeredAdapters: ReadonlyArray<AnyAdapter> = [telegramAdapter];

export { telegramAdapter };
export type {
  ChannelAdapter,
  ChannelTarget,
  ChannelInvariants,
  ChannelName,
  ComposedBrief,
  FormatOptions,
} from "./types";
