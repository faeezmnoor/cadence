/**
 * Shared types for the config-agent tool runtime.
 *
 * Tools are implemented as plain descriptor objects (name + description +
 * Zod schema + handler) so they can be unit-tested in isolation. Wiring
 * descriptors into the Vercel AI SDK `tool()` shape happens at the chat
 * route boundary (T-103), not here. This keeps T-105 free of any
 * @ai-sdk/* runtime dependency.
 */
import type { z } from "zod";
import type {
  DigestSpecDraft,
  DigestSpecV1,
} from "@/lib/digest-spec/schema";

/**
 * Mutable session state the config agent operates on across one chat thread.
 *
 * - `draft` — the in-progress DigestSpec being built. Starts undefined.
 * - `savedSpecId` — populated once `confirm_and_save` succeeds.
 * - `userId` — for persistence; comes from the authed tRPC ctx.
 * - `threadId` — for chat message persistence (T-107/T-108).
 */
export interface ConfigAgentSession {
  userId: string;
  threadId: string;
  draft?: DigestSpecDraft;
  savedSpecId?: string;
  /**
   * Manage mode (plan §4.3): the digest_specs id this thread is bound to
   * (= chat_threads.spec_id, server-derived — NEVER from client input).
   * Set only on manage turns; `send_sample`/`save_changes` target it.
   */
  boundSpecId?: string;
}

/**
 * Side-effect surface a tool handler may reach into. Kept narrow so tests
 * can stub it without spinning up Supabase / Drizzle.
 *
 * `saveSpec` is injected (rather than tools importing the tRPC route
 * directly) to keep this module callable from both:
 *   - the chat route (production path, wired to digestSpec.updateRaw logic)
 *   - the eval harness (T-111, in-memory stub)
 */
export interface ConfigAgentContext {
  session: ConfigAgentSession;
  saveSpec: (args: {
    userId: string;
    spec: DigestSpecV1;
  }) => Promise<{
    id: string;
    version: number;
    /**
     * CAD-212: set when the brief-count gate redirected this save into an
     * update of the user's existing brief. The agent must relay it.
     */
    notice?: string;
  }>;
  /**
   * Manage mode (plan §4.3.3) — injected like `saveSpec` so the eval
   * harness can stub them without a DB. Optional because setup contexts
   * never carry them; the manage tools fail with a recoverable envelope
   * (safeExecute) if invoked without their dependency.
   *
   * `updateSpec` → updateSpecInPlace: same spec id forever, version + 1,
   * ZERO cap interaction (never touches saveSpecForUser / maxBriefsForEmail).
   */
  updateSpec?: (args: {
    userId: string;
    specId: string;
    spec: DigestSpecV1;
  }) => Promise<{ id: string; version: number }>;
  /**
   * `sendSample` → runSampleForUser({origin:'chat_tool'}): typed results,
   * never throws for guards — the model phrases failures conversationally.
   */
  sendSample?: (args: {
    dryRun: boolean;
    specId: string;
  }) => Promise<import("@/server/digest/sample").SampleResult>;
}

/**
 * Generic tool descriptor. `TInput` is the Zod-inferred input shape; the
 * handler returns whatever the agent should see as the tool result (kept
 * as `unknown` here so each tool can specialize its own return type).
 */
export interface ToolDescriptor<TSchema extends z.ZodType> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (
    input: z.infer<TSchema>,
    ctx: ConfigAgentContext
  ) => Promise<unknown>;
}
