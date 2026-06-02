/**
 * Shared digest pipeline (T-210 + T-211).
 *
 * One function that owns the full pipeline so both the manual
 * `digest.sampleNow` mutation and the scheduled `digest.run` Inngest
 * handler stay in sync:
 *
 *   1. Resolve user + current spec
 *   2. Collect sources (Brave + RSS — yfinance deferred to T-206)
 *   3. Compose markdown via Haiku 4.5
 *   4. Split into Telegram-safe parts
 *   5. Deliver (unless dryRun OR user isn't linked)
 *   6. Persist digest_runs row
 *
 * Idempotency:
 *   - Scheduled runs accept an explicit `runDate` and rely on the
 *     (user_id, run_date) unique index. Callers should pre-check
 *     to skip re-runs cleanly.
 *   - dryRun composes the brief and returns it WITHOUT persisting a
 *     digest_runs row, so a preview click doesn't consume the
 *     scheduled idempotency slot for the same UTC date and doesn't
 *     leave ghost "composing" rows in history.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestRuns, digestSpecs, learningLog, users } from "@/server/db/schema";
import { buildFeedbackBlock } from "@/server/ai/composer/feedback-block";

/**
 * Auto-heal: any successful delivery clears users.state === "delivery_broken".
 *
 * Covers both pipeline entry points:
 *   - Cron-dispatched path (digest-run.ts handler): a successful retry after
 *     a previous failure flips the user back to active so the next minute's
 *     dispatch claims them again.
 *   - Manual sampleNow path: lets a broken user self-recover by pushing a
 *     successful brief, without going through admin replay (T-305).
 *
 * Guarded by an equality predicate so we only write when the row actually
 * transitions broken -> active. No-op on already-active users keeps audit
 * noise / updated_at churn down.
 *
 * Decision locked 2026-06-02: single-tenant prod, low blast radius, lower
 * friction than admin-only recovery.
 */
async function autoHealDeliveryBroken(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ state: "active", updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.state, "delivery_broken")));
}
import { composeDigest } from "@/server/ai/composer/compose";
import type {
  ComposerInput,
  ComposerSourcesBundle,
} from "@/server/ai/composer/types";
import { formatComposerOutput } from "@/server/telegram/format";
import { buildFeedbackKeyboard } from "@/server/telegram/keyboard";
import { isTelegramConfigured, getBot } from "@/server/telegram/client";
import { isBraveConfigured, braveSearch, BraveKeyMissingError } from "@/server/connectors/brave-search";
import { recentRssForSpec } from "@/server/connectors/rss";
import { sanitizeError, classifyError, type ErrorClass } from "./errors";

export interface RunDigestParams {
  userId: string;
  /** Optional ISO date (YYYY-MM-DD). Defaults to today (UTC). */
  runDate?: string;
  /**
   * T-302: when the cron dispatcher pre-claimed a digest_runs row, it
   * passes the id here. The pipeline updates that row instead of inserting
   * a new one — keeps the (spec_id, delivery_minute_utc) UNIQUE contract
   * authoritative.
   */
  digestRunId?: string;
  /** When true: skip Telegram send even if linked. */
  dryRun?: boolean;
  /** Skip source-fetching errors (Brave key missing etc) and continue with what we have. */
  tolerateSourceFailures?: boolean;
}

export type RunStatus =
  | "delivered"
  | "composed_dry_run"
  | "no_telegram_link"
  | "no_spec"
  | "duplicate"
  | "failed";

export interface RunDigestResult {
  status: RunStatus;
  digestRunId: string | null;
  markdown: string | null;
  partsSent: number;
  telegramMessageId: number | null;
  error?: string;
  /**
   * T-303: when status === "failed", tells the Inngest handler whether to
   * throw (let Inngest retry) or to give up and flip the user to
   * delivery_broken. `undefined` on success paths.
   */
  errorClass?: ErrorClass;
  /**
   * T-303: post-increment value of digest_runs.attempt_count for the row
   * persisted by this invocation. The caller compares against
   * MAX_DELIVERY_ATTEMPTS to decide whether to escalate to delivery_broken.
   */
  attemptCount?: number;
}

/**
 * T-303: max attempts BEFORE we flip the user to delivery_broken. Inngest's
 * native function retries handle the actual backoff; this caps the total
 * number of pipeline invocations per claimed digest_runs row across all
 * retries.
 */
export const MAX_DELIVERY_ATTEMPTS = 3;

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runDigestPipeline(params: RunDigestParams): Promise<RunDigestResult> {
  const { userId, dryRun = false, tolerateSourceFailures = true, digestRunId } = params;
  const runDate = params.runDate ?? todayIsoUtc();

  // 1. Load user + current spec
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return { status: "failed", digestRunId: null, markdown: null, partsSent: 0, telegramMessageId: null, error: "user not found" };
  }
  const specRows = await db
    .select()
    .from(digestSpecs)
    .where(and(eq(digestSpecs.userId, userId), eq(digestSpecs.isCurrent, true)))
    .limit(1);
  const specRow = specRows[0];
  if (!specRow) {
    return { status: "no_spec", digestRunId: null, markdown: null, partsSent: 0, telegramMessageId: null };
  }

  // 2. Sources — Brave + RSS. yfinance/prices deferred.
  const sources: ComposerSourcesBundle = { search: [], rss: [] };
  try {
    if (isBraveConfigured()) {
      // One Brave query per top-level topic, cap 5 topics to keep cost predictable.
      const spec = specRow.spec as { topics?: string[] };
      const topics = (spec.topics ?? []).slice(0, 5);
      for (const query of topics) {
        const res = await braveSearch(query, { count: 10 });
        sources.search.push({ query, results: res.results });
      }
    }
  } catch (err) {
    if (err instanceof BraveKeyMissingError) {
      // expected when CAD-56 not provisioned; continue with no search
    } else if (!tolerateSourceFailures) {
      throw err;
    } else {
      console.warn("[digest:brave]", err);
    }
  }

  try {
    sources.rss = (await recentRssForSpec(specRow.id, { limit: 30, sinceHours: 48 })).map((r) => ({
      feedUrl: "",
      title: r.title,
      url: r.url,
      publishedAt: r.publishedAt,
      summary: r.summary,
    }));
  } catch (err) {
    if (!tolerateSourceFailures) throw err;
    console.warn("[digest:rss]", err);
  }

  // 3. Compose
  //
  // T-404: hybrid feedback injection.
  //   - users.distilled_prefs (canonical bias from T-405; may be null
  //     until the first weekly distill lands).
  //   - Recent undistilled learning_log rows (newest first, verbatim).
  // The builder enforces a 500-token cap; we pull a generous candidate
  // window (50 rows) and let it trim. Stamp consumed_at on included rows
  // after the LLM call succeeds — failures shouldn't burn the signal.
  const distilledPrefs = Array.isArray(user.distilledPrefs)
    ? (user.distilledPrefs as string[])
    : null;
  const rawCandidateRows = await db
    .select({
      id: learningLog.id,
      rawText: learningLog.rawText,
      createdAt: learningLog.createdAt,
    })
    .from(learningLog)
    .where(and(eq(learningLog.userId, userId), isNull(learningLog.distilledAt)))
    .orderBy(desc(learningLog.createdAt))
    .limit(50);

  const feedbackBlock = buildFeedbackBlock({
    distilledPrefs,
    rawCandidates: rawCandidateRows,
  });

  let markdown: string;
  let composeCostUsd = 0;
  try {
    const composerInput: ComposerInput = {
      spec: specRow.spec as ComposerInput["spec"],
      sources,
      distilledPrefs: feedbackBlock.distilledPrefs.length > 0
        ? feedbackBlock.distilledPrefs
        : undefined,
      recentRawNotes: feedbackBlock.recentRawNotes.length > 0
        ? feedbackBlock.recentRawNotes
        : undefined,
      userId,
      digestRunId: null, // updated below once row exists
    };
    const out = await composeDigest(composerInput);
    markdown = out.markdown;
    composeCostUsd = out.costUsd ?? 0;

    // T-404: mark raw learning_log rows as consumed *after* a successful
    // compose. If compose throws we keep them unconsumed so the next
    // attempt re-injects them. We don't gate on dryRun: a preview should
    // still record that the signal was seen — the row isn't re-distilled
    // by this stamp (T-405 owns distilled_at semantics).
    if (feedbackBlock.consumedRawIds.length > 0) {
      await db
        .update(learningLog)
        .set({ consumedAt: new Date() })
        .where(inArray(learningLog.id, feedbackBlock.consumedRawIds));
    }
  } catch (err) {
    const error = sanitizeError(err);
    const errorClass = classifyError(err);
    // Persist failed run for visibility. T-302/T-303: prefer UPDATE on the
    // claimed row and atomically bump attempt_count via SQL so retries
    // never race-clobber the counter.
    if (digestRunId) {
      const updated = await db
        .update(digestRuns)
        .set({
          status: "failed",
          error,
          lastError: error,
          attemptCount: sql`${digestRuns.attemptCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(digestRuns.id, digestRunId))
        .returning({ attemptCount: digestRuns.attemptCount });
      return {
        status: "failed",
        digestRunId,
        markdown: null,
        partsSent: 0,
        telegramMessageId: null,
        error,
        errorClass,
        attemptCount: updated[0]?.attemptCount ?? undefined,
      };
    }
    const failedRow = await db
      .insert(digestRuns)
      .values({
        userId,
        specId: specRow.id,
        status: "failed",
        runDate,
        error,
        lastError: error,
        attemptCount: 1,
      })
      .returning({ id: digestRuns.id, attemptCount: digestRuns.attemptCount });
    return {
      status: "failed",
      digestRunId: failedRow[0]?.id ?? null,
      markdown: null,
      partsSent: 0,
      telegramMessageId: null,
      error,
      errorClass,
      attemptCount: failedRow[0]?.attemptCount ?? undefined,
    };
  }

  // 4. Format for Telegram
  const parts = formatComposerOutput(markdown);

  // 5. Deliver or skip
  let telegramMessageId: number | null = null;
  let partsSent = 0;
  let status: RunStatus;
  const canSend = !dryRun && isTelegramConfigured() && user.telegramChatId != null;
  if (canSend) {
    try {
      const bot = getBot();
      // T-401 (CAD-42): attach inline-keyboard ONLY to the final part, and
      // ONLY when:
      //   - the spec has keyboard_enabled = true (per-spec opt-in), and
      //   - we already have a digestRunId (cron path pre-claimed a row).
      // Manual sampleNow path (no pre-claimed id) skips the keyboard —
      // dev-time previews don't need feedback collection.
      const keyboardOn = specRow.keyboardEnabled && digestRunId != null;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const replyMarkup =
          keyboardOn && isLast ? buildFeedbackKeyboard(digestRunId!) : undefined;
        const m = await bot.api.sendMessage(Number(user.telegramChatId), part.text, {
          parse_mode: part.parseMode,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
        if (telegramMessageId == null) telegramMessageId = m.message_id;
        partsSent++;
      }
      status = "delivered";
    } catch (err) {
      const error = sanitizeError(err);
      const errorClass = classifyError(err);
      // Do NOT console.error the raw err — it may carry PII (chat_id, token).
      // The sanitized line above is what the caller logs.
      console.warn("[digest:send] sanitized:", error);
      // Failed delivery still records the run; T-303 retry decides if we
      // re-enqueue or escalate to delivery_broken.
      if (digestRunId) {
        const updated = await db
          .update(digestRuns)
          .set({
            status: "failed",
            composedMarkdown: markdown,
            sourcesBundle: sources,
            costUsd: composeCostUsd.toString(),
            error,
            lastError: error,
            attemptCount: sql`${digestRuns.attemptCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(digestRuns.id, digestRunId))
          .returning({ attemptCount: digestRuns.attemptCount });
        return {
          status: "failed",
          digestRunId,
          markdown,
          partsSent,
          telegramMessageId,
          error,
          errorClass,
          attemptCount: updated[0]?.attemptCount ?? undefined,
        };
      }
      const failedRow = await db
        .insert(digestRuns)
        .values({
          userId,
          specId: specRow.id,
          status: "failed",
          runDate,
          composedMarkdown: markdown,
          sourcesBundle: sources,
          costUsd: composeCostUsd.toString(),
          error,
          lastError: error,
          attemptCount: 1,
        })
        .returning({ id: digestRuns.id, attemptCount: digestRuns.attemptCount });
      return {
        status: "failed",
        digestRunId: failedRow[0]?.id ?? null,
        markdown,
        partsSent,
        telegramMessageId,
        error,
        errorClass,
        attemptCount: failedRow[0]?.attemptCount ?? undefined,
      };
    }
  } else {
    status = dryRun ? "composed_dry_run" : "no_telegram_link";
  }

  // Dry-run previews never touch digest_runs: they shouldn't consume the
  // scheduled (user_id, run_date) idempotency slot, and they shouldn't
  // leave ghost "composing" rows in history. Caller gets the markdown back.
  if (dryRun) {
    return {
      status: "composed_dry_run",
      digestRunId: null,
      markdown,
      partsSent: 0,
      telegramMessageId: null,
    };
  }

  // 6. Persist
  //   - T-302 cron path: dispatcher pre-claimed a `pending` row; UPDATE it.
  //   - Legacy / manual path: INSERT a fresh row.
  if (digestRunId) {
    await db
      .update(digestRuns)
      .set({
        status: status === "delivered" ? "delivered" : "composing",
        composedMarkdown: markdown,
        sourcesBundle: sources,
        telegramMessageId: telegramMessageId ?? undefined,
        costUsd: composeCostUsd.toString(),
        // T-303: bump attempt_count atomically. On a fresh row this goes
        // 0 -> 1; on a retry of a previously-failed claim this records the
        // attempt count at which we succeeded (visible in T-304 admin viewer).
        // We do NOT clear last_error on success — keep the diagnostic trail.
        attemptCount: sql`${digestRuns.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(digestRuns.id, digestRunId));

    // T-304 bonus: auto-heal delivery_broken on success. No-op if active.
    // Future per-spec rows naturally start with attempt_count=0; we don't
    // need to touch the just-updated row's counter.
    if (status === "delivered") {
      await autoHealDeliveryBroken(userId);
    }

    return {
      status,
      digestRunId,
      markdown,
      partsSent,
      telegramMessageId,
    };
  }

  const inserted = await db
    .insert(digestRuns)
    .values({
      userId,
      specId: specRow.id,
      status: status === "delivered" ? "delivered" : "composing",
      runDate,
      composedMarkdown: markdown,
      sourcesBundle: sources,
      telegramMessageId: telegramMessageId ?? undefined,
      costUsd: composeCostUsd.toString(),
    })
    .returning({ id: digestRuns.id });

  // T-304 bonus: auto-heal on a successful manual / sampleNow delivery too.
  if (status === "delivered") {
    await autoHealDeliveryBroken(userId);
  }

  return {
    status,
    digestRunId: inserted[0]!.id,
    markdown,
    partsSent,
    telegramMessageId,
  };
}
