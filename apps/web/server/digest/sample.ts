/**
 * Shared sample core (brief manage mode, plan §4.5).
 *
 * One function that owns the "compose a sample for this user now" guards so
 * the tRPC `digest.sampleNow` mutation and the chat agent's `send_sample`
 * tool stay in sync:
 *
 *   1. expectedSpecId guard (legacy tRPC path: is_current + not-archived)
 *   2. specId guard (manage tool path: ownership + not-archived on the
 *      BOUND spec — not is_current, multi-brief correct)
 *   3. 60s dry-run throttle (chat_tool origin only this wave, exec RC6)
 *   4. 5-minute delivery cooldown (delivered sends only, per-user across
 *      ALL briefs — the query has no spec filter, by design this wave)
 *   5. runDigestPipeline({trigger: 'sample'})
 *
 * Typed results instead of throws: the chat agent must phrase failures
 * conversationally and must never see a raw error; the tRPC wrapper maps
 * codes back to the EXACT TRPCError codes/messages brief-actions depends on.
 *
 * Telegram /sample + admin replay paths call `runDigestPipeline` directly
 * and never route through this core (verified: only routers/digest.ts and
 * the inngest digest-run handler import the pipeline; the admin replay
 * emits `digest/run.scheduled`).
 */
import { and, desc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, users } from "@/server/db/schema";
import { runDigestPipeline, type RunDigestResult } from "@/server/digest/run";

/**
 * Cool-down window for delivered samples (moved verbatim from
 * server/trpc/routers/digest.ts in the manage-mode wave).
 *
 * PM-audit #9: bumped from 30s to 5min so the "Send sample now" button on
 * /app/link and /settings/account can't be used to mass-burn credits in a
 * tight loop. 5 minutes is the smallest window that still feels generous
 * for "I didn't see it, send again" while gating the LLM cost ceiling at
 * one paid compose per 5 minutes per user.
 *
 * Migration 0004 dropped the (user_id, run_date) UNIQUE that previously
 * folded back-to-back clicks; this is the application-level replacement.
 */
export const SAMPLE_NOW_COOLDOWN_MS = 5 * 60_000;

/**
 * Exec RC6: dry-run composes bypass BOTH the delivery cooldown and the
 * credit gate (verified server/digest/run.ts:302–305) and are rowless
 * (run.ts:277) — without this they're an agent-loopable zero-credit
 * full-pipeline compose. 60s per user, atomic claim on
 * users.last_sample_dry_run_at. Applies to the chat_tool origin only this
 * wave: the panel "Preview" button (trpc origin) is user-click-bound,
 * shipped behavior.
 */
export const DRY_RUN_COOLDOWN_MS = 60_000;

export type SampleResult =
  | { ok: true; run: RunDigestResult; markdown: string | null }
  | {
      ok: false;
      code: "cooldown";
      scope: "delivery" | "dry_run";
      retryAfterMs: number;
    }
  | { ok: false; code: "stale_spec" }
  | { ok: false; code: "spec_not_found" | "archived" }
  | {
      ok: false;
      code: "no_telegram" | "no_credits" | "no_spec" | "duplicate" | "failed";
      run: RunDigestResult;
    };

/**
 * ACX.5 `sample_blocked` reason vocabulary — single-sourced here so every
 * surface that logs sample analytics (chat tool `via:'chat_tool'`, panel
 * button `via:'panel_button'`) emits the same reason strings and dashboards
 * never fork (exec PR review round 1, CPO#1).
 */
export function sampleBlockedReason(code: string, scope?: string): string {
  if (code === "cooldown") {
    return scope === "dry_run" ? "dry_run_cooldown" : "cooldown";
  }
  return code;
}

/**
 * Pure retry math, exported for tests: how long until the window opened by
 * `claimedAt` (newest qualifying run / last dry-run claim) closes.
 */
export function retryAfterMsFrom(
  claimedAt: Date,
  windowMs: number,
  now: Date = new Date()
): number {
  return Math.max(0, claimedAt.getTime() + windowMs - now.getTime());
}

/** Pipeline outcome → typed failure code mapping (exported for tests). */
export function mapRunToResult(run: RunDigestResult): SampleResult {
  switch (run.status) {
    case "delivered":
    case "composed_dry_run":
      return { ok: true, run, markdown: run.markdown };
    case "no_telegram_link":
    // Settings-surfacing v1 (gap 3): gate-check skip when Telegram is
    // unlinked. Same user-facing meaning as no_telegram_link for the
    // sample path — no link, nothing to deliver.
    case "skipped_unlinked":
      return { ok: false, code: "no_telegram", run };
    case "skipped_no_credits":
      return { ok: false, code: "no_credits", run };
    case "no_spec":
      return { ok: false, code: "no_spec", run };
    case "duplicate":
      return { ok: false, code: "duplicate", run };
    case "failed":
      return { ok: false, code: "failed", run };
  }
}

export async function runSampleForUser(args: {
  userId: string;
  dryRun: boolean;
  /** Dry-run throttle applies to chat_tool only this wave (exec RC6). */
  origin: "chat_tool" | "trpc";
  /** Manage tool: bound spec (ownership + not-archived guard). */
  specId?: string;
  /** Legacy tRPC path: is_current + not-archived assertion. */
  expectedSpecId?: string;
}): Promise<SampleResult> {
  const { userId, dryRun, origin, specId, expectedSpecId } = args;

  if (expectedSpecId) {
    // Wave 5 Bug 10/11: also exclude archived specs. Otherwise an
    // archived `is_current=true` row (legacy drift from briefs.archive
    // not flipping the flag) would silently pass the expected-spec
    // guard and let sampleNow compose against a tombstoned brief.
    const currentRows = await db
      .select({ id: digestSpecs.id })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, userId),
          eq(digestSpecs.isCurrent, true),
          ne(digestSpecs.status, "archived")
        )
      )
      .limit(1);
    const currentId = currentRows[0]?.id ?? null;
    if (currentId !== expectedSpecId) {
      return { ok: false, code: "stale_spec" };
    }
  }

  if (specId) {
    // Manage tool path (AC2.4): the thread-bound spec must exist, belong to
    // this user, and not be archived. Fails closed BEFORE any compose or
    // throttle claim — a refused guard must not consume the dry-run window.
    const boundRows = await db
      .select({ id: digestSpecs.id, status: digestSpecs.status })
      .from(digestSpecs)
      .where(and(eq(digestSpecs.id, specId), eq(digestSpecs.userId, userId)))
      .limit(1);
    const bound = boundRows[0];
    if (!bound) return { ok: false, code: "spec_not_found" };
    if (bound.status === "archived") return { ok: false, code: "archived" };
  }

  if (dryRun && origin === "chat_tool") {
    // Atomic single-row claim: durable across serverless instances,
    // race-safe, bounds even the in-turn maxSteps agent loop to one
    // compose per window. Zero rows updated ⇒ inside the window.
    const now = new Date();
    const claimed = await db
      .update(users)
      .set({ lastSampleDryRunAt: now })
      .where(
        and(
          eq(users.id, userId),
          or(
            isNull(users.lastSampleDryRunAt),
            lt(users.lastSampleDryRunAt, new Date(now.getTime() - DRY_RUN_COOLDOWN_MS))
          )
        )
      )
      .returning({ id: users.id });
    if (claimed.length === 0) {
      const rows = await db
        .select({ lastSampleDryRunAt: users.lastSampleDryRunAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const last = rows[0]?.lastSampleDryRunAt ?? now;
      return {
        ok: false,
        code: "cooldown",
        scope: "dry_run",
        retryAfterMs: retryAfterMsFrom(last, DRY_RUN_COOLDOWN_MS, now),
      };
    }
  }

  // Dedup guard (replaces the dropped user_run_date_uq, per T-303 bonus).
  // Skip the cool-down for dry-runs — previewing twice is cheap and
  // doesn't hit Telegram (the chat-origin dry-run throttle above is the
  // separate RC6 abuse bound).
  //
  // QA P1 #5: the cooldown query previously counted EVERY digest_runs
  // row in the window, including status='failed'. A failed compose
  // (no Telegram link, model error, source bundle empty) would lock
  // the user out for 5 minutes even though no brief actually went out.
  // Dry-runs already short-circuit before the persist block in
  // server/digest/run.ts so they don't land in digest_runs at all —
  // we only need to exclude 'failed' here. Status values that should
  // count as a real send: 'composing' (in-flight) and 'delivered'.
  //
  // NOTE (plan §4.5, AC2.5): no spec filter — the window is per-user
  // across ALL briefs. Both surfaces inherit the one query, so the
  // cross-surface window is shared by construction.
  if (!dryRun) {
    const since = new Date(Date.now() - SAMPLE_NOW_COOLDOWN_MS);
    const recent = await db
      .select({ id: digestRuns.id, createdAt: digestRuns.createdAt })
      .from(digestRuns)
      .where(
        and(
          eq(digestRuns.userId, userId),
          gte(digestRuns.createdAt, since),
          ne(digestRuns.status, "failed")
        )
      )
      .orderBy(desc(digestRuns.createdAt))
      .limit(1);
    const newest = recent[0];
    if (newest) {
      return {
        ok: false,
        code: "cooldown",
        scope: "delivery",
        retryAfterMs: retryAfterMsFrom(newest.createdAt, SAMPLE_NOW_COOLDOWN_MS),
      };
    }
  }

  const run = await runDigestPipeline({
    userId,
    specId,
    dryRun,
    // UX P0 #2: surface the sample-brief banner. Both the auto-fire
    // post-link path and the manual "Send sample now" button hit this
    // path, and both should label the result as a sample.
    trigger: "sample",
  });
  return mapRunToResult(run);
}
