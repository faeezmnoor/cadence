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
import { getProviders, isProTierAlphaEnabled, type Tier } from "@/server/ai/providers";
import { isProTierCostSane } from "@/server/billing/circuit-breaker";
import type {
  ComposerInput,
  ComposerSourcesBundle,
} from "@/server/ai/composer/types";
import { formatComposerOutput } from "@/server/telegram/format";
import { buildFeedbackKeyboard } from "@/server/telegram/keyboard";
import { isTelegramConfigured, getBot } from "@/server/telegram/client";
import { isBraveConfigured, braveSearch, BraveKeyMissingError } from "@/server/connectors/brave-search";
import { recentRssForSpec } from "@/server/connectors/rss";
import {
  debitForDelivery,
  recordSkipForCredits,
  shouldSkipForCredits,
} from "@/server/billing/debit";
import { creditCostForTier } from "@/server/billing/cost";
import { buildLowBalanceFooter, type Cadence } from "@/server/billing/low-balance-footer";
import { TRIAL_CREDITS } from "@/server/billing/packs";
import { sanitizeError, classifyError, type ErrorClass } from "./errors";
import {
  resolveSourceUrls,
  sourcesResolvedRate,
  type SourceResolveResult,
} from "./sources/resolve";
import type { BriefJson } from "@/server/ai/composer/schema";

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
  | "failed"
  /** T-505a: balance ≤ −1 at gate-check time. Composer + send skipped. */
  | "skipped_no_credits";

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

/**
 * CAD-91: Pro tier footer copy. Exported so tests can lock the exact
 * wording — the badge is user-visible and ties the 3-credit debit to
 * an explanation in the brief itself.
 */
export const PRO_BADGE_FOOTER = "🔬 Pro brief — deeper research, 3 credits.";

export function appendProBadge(markdown: string): string {
  return markdown + "\n\n" + PRO_BADGE_FOOTER;
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

  // T-505a: skip-when-broke gate. Runs BEFORE Brave/RSS/composer so we
  // don't pay LLM cost for a brief we'll never deliver. PRD §6.1: balance=0
  // still delivers (1-brief grace credit), balance ≤ −1 is broke.
  //
  // Bypass for dryRun: preview/sampleNow paths don't debit, so they
  // shouldn't gate on balance either — Faeez wants to inspect output even
  // for a paused user.
  if (!dryRun) {
    const decision = shouldSkipForCredits(user.creditsBalance);
    if (decision.skip) {
      // Mark the claimed digest_runs row (if any) with the skip status so
      // the admin viewer sees it instead of an empty "composing" row.
      if (digestRunId) {
        await db
          .update(digestRuns)
          .set({
            status: "skipped_no_credits",
            updatedAt: new Date(),
          })
          .where(eq(digestRuns.id, digestRunId));
        await recordSkipForCredits({
          userId,
          digestRunId,
          balance: decision.balance,
        });
      }
      return {
        status: "skipped_no_credits",
        digestRunId: digestRunId ?? null,
        markdown: null,
        partsSent: 0,
        telegramMessageId: null,
      };
    }
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
  // Evals Phase 0: post-compose source-resolution metadata. Populated after
  // a successful compose (we need the brief's sources list to ping). Stored
  // on `digest_runs.metadata.sourceResolve`. Never blocks delivery — a low
  // rate is a logged warning, not a failure.
  let runMetadata: Record<string, unknown> = {};
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
    // CAD-88: route to the spec's tier. The bundle's resolved `tier` may
    // differ from the spec's `tier` when PRO_TIER_ALPHA is off — the
    // provider layer falls back to default and we record the *resolved*
    // tier on metadata so admins can see which stack actually ran.
    const requestedTier = (specRow.tier as Tier | undefined) ?? "default";

    // CAD-101: alpha-flag safety net. If PRO_TIER_ALPHA is off but a spec
    // still has tier="pro" persisted from a prior window when the flag
    // was on, downgrade silently to default. Belt-and-braces: getProviders
    // already does the same fallback, but doing it here means metadata
    // records the reason and the credit-cost lookup below sees "default".
    // Without this, flipping the flag back off could strand the alpha
    // cohort on a Pro-priced credit cost serving a default brief.
    let alphaSafetyDowngrade = false;
    if (requestedTier === "pro" && !isProTierAlphaEnabled()) {
      alphaSafetyDowngrade = true;
      console.warn(
        `[digest:tier] user=${userId} spec=${specRow.id} requested=pro ` +
          `but PRO_TIER_ALPHA is off — downgrading to default`
      );
    }

    // CAD-89: pragmatic downgrade. If a Pro brief costs 3 credits but the
    // user only has 1 or 2 (positive balance, not broke), don't fail —
    // serve them via the default stack and debit 1. Skip-when-broke
    // (balance ≤ -1) already returned above; the grace credit (balance=0)
    // is handled here too — Pro at balance=0 downgrades to default since
    // 0 < 3.
    //
    // dryRun bypasses (no debit on previews; Faeez should see the Pro
    // output regardless of the user's balance).
    let effectiveTier: Tier = requestedTier;
    let downgradeReason: string | null = null;
    if (alphaSafetyDowngrade) {
      effectiveTier = "default";
      downgradeReason = "alpha_flag_off";
    } else if (
      !dryRun &&
      requestedTier === "pro" &&
      user.creditsBalance < creditCostForTier("pro")
    ) {
      effectiveTier = "default";
      downgradeReason = "insufficient_credits";
      console.warn(
        `[digest:downgrade] user=${userId} balance=${user.creditsBalance} ` +
          `requested=pro effective=default reason=${downgradeReason}`
      );
    } else if (requestedTier === "pro") {
      // CAD-102 (T4): cost-overrun circuit breaker. If today's Pro spend
      // is above PRO_TIER_DAILY_USD_CAP, downgrade to default to stop the
      // bleeding. Sentry-alerts once per UTC day so we get paged on the
      // trip but not on every dispatch after.
      const sanity = await isProTierCostSane();
      if (!sanity.ok) {
        effectiveTier = "default";
        downgradeReason = "cost_cap";
        console.warn(
          `[digest:downgrade] user=${userId} reason=cost_cap usdToday=$${sanity.usdToday.toFixed(2)} cap=$${sanity.capUsd}`
        );
        try {
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureMessage(
            `Pro tier cost cap tripped: $${sanity.usdToday.toFixed(2)} / $${sanity.capUsd} today`,
            {
              level: "warning",
              tags: { route: "digest.compose", reason: "cost_cap" },
              extra: { usdToday: sanity.usdToday, capUsd: sanity.capUsd },
              fingerprint: ["pro-tier-cost-cap", new Date().toISOString().slice(0, 10)],
            }
          );
        } catch {
          // Sentry-optional; don't fail the pipeline on telemetry hiccups.
        }
      }
    }
    let providers = getProviders(effectiveTier);
    let out: Awaited<ReturnType<typeof providers.composer.compose>>;
    try {
      out = await providers.composer.compose(composerInput);
    } catch (composerErr) {
      // CAD-102 (T3): Pro composer failure → fallback to the default
      // composer so a flaky Sonar/Sonnet call doesn't deny the user their
      // brief entirely. Only catches Pro→default; a default composer
      // failure re-throws and lands in the outer catch below so the
      // pipeline can retry or escalate to delivery_broken.
      //
      // The user gets a default brief (no 🔬 footer, debited at 1 credit
      // via the resolved=default tier downstream), and the failure is
      // captured in Sentry + stamped on runMetadata.fallback so admins
      // can see the rate of Pro→default fallbacks without trawling logs.
      if (providers.tier !== "pro") {
        throw composerErr;
      }
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(composerErr, {
        tags: { route: "digest.compose", tier: "pro" },
        extra: { userId, digestRunId: digestRunId ?? null },
      });
      const reason = sanitizeError(composerErr);
      console.warn(
        `[digest:fallback] user=${userId} pro composer failed, retrying on default — ${reason}`
      );
      providers = getProviders("default");
      out = await providers.composer.compose(composerInput);
      runMetadata.fallback = {
        from: "pro",
        to: "default",
        reason,
      };
      effectiveTier = "default";
    }
    markdown = out.markdown;
    composeCostUsd = out.costUsd ?? 0;
    runMetadata.tier = {
      requested: requestedTier,
      resolved: providers.tier,
      composerId: providers.composer.id,
      composerModelId: providers.composer.modelId,
    };
    if (downgradeReason) {
      // CAD-89: per spec, downgrade reason lands on digestRuns.metadata
      // so the admin run viewer can surface "downgraded from Pro" without
      // joining transactions.
      runMetadata.downgrade = {
        from: "pro",
        to: "default",
        reason: downgradeReason,
        balanceAtDispatch: user.creditsBalance,
      };
    }

    // Evals Phase 0: ping every cited URL post-compose, persist results
    // into metadata.sourceResolve. Bounded by 5s/url + parallel — at 15
    // sources max this adds ~5s wall-clock to the worst case, which is
    // fine relative to the compose call itself.
    try {
      const brief = out.brief as BriefJson;
      const urls = brief.sources.map((s) => s.url);
      const results = await resolveSourceUrls(urls);
      const rate = sourcesResolvedRate(results);
      runMetadata.sourceResolve = {
        rate,
        results,
        checkedAt: new Date().toISOString(),
      } satisfies {
        rate: number;
        results: SourceResolveResult[];
        checkedAt: string;
      };
      if (rate < 0.8) {
        console.warn(
          `[digest:eval] source-resolve rate ${(rate * 100).toFixed(0)}% (<80%) for ${urls.length} URLs`
        );
      }
    } catch (err) {
      // Resolver promises never to throw, but defend the pipeline anyway.
      console.warn("[digest:eval] source-resolve unexpectedly threw:", err);
    }

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

  // T-507a: append low-balance footer to the brief markdown BEFORE splitting.
  // We use the pre-debit balance (-1 from where the user will land after this
  // delivery's debit) because the footer copy is about the user's state going
  // forward. balance==1 here → after debit becomes 0 → paywall tier fires.
  //
  // Skipping for dryRun: preview shouldn't surface nudges based on a balance
  // that won't actually decrement. Skipping for unconfigured app URL too —
  // we'd emit a broken link otherwise.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!dryRun && appUrl.length > 0) {
    const spec = specRow.spec as { cadence?: { frequency?: Cadence } };
    const frequency = spec.cadence?.frequency ?? "daily";
    // The balance going into this brief — debit not yet applied. Subtract 1
    // to reason about post-delivery state.
    const projectedBalance = user.creditsBalance - 1;
    const trialActive =
      user.trialCreditsGrantedAt != null && user.creditsBalance <= TRIAL_CREDITS;
    const footer = buildLowBalanceFooter({
      creditsBalance: projectedBalance,
      cadence: frequency,
      trialActive,
      appUrl,
    });
    if (footer) markdown = markdown + footer;
  }

  // CAD-91: 🔬 Pro tier badge. Only emitted when the brief was actually
  // composed on the Pro stack (resolved tier === "pro"). Surfaced to the
  // user so they can see which stack served them and tie it back to the
  // 3-credit charge. Reads tier from runMetadata.tier.resolved which is
  // populated post-CAD-89 (the resolved tier, not the requested tier —
  // downgraded briefs MUST NOT carry the Pro badge).
  const resolvedTier = (runMetadata.tier as { resolved?: Tier } | undefined)?.resolved;
  if (resolvedTier === "pro") {
    markdown = appendProBadge(markdown);
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
            metadata: runMetadata,
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
          metadata: runMetadata,
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
        metadata: runMetadata,
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
      // T-505a: per-brief debit. Runs ONLY after a confirmed Telegram
      // delivery so we never charge for a failed send. The 1-brief grace
      // rule means balance may go to −1 here; that's expected — the next
      // dispatch will hit the skip gate.
      try {
        await debitForDelivery({
          userId,
          digestRunId,
          // CAD-89: debit by RESOLVED tier (post-downgrade).
          tier: (runMetadata.tier as { resolved?: Tier } | undefined)?.resolved ?? "default",
        });
      } catch (err) {
        // Never break a successful delivery on debit failure. Log and
        // accept that this brief flew free — preferable to telling Stripe
        // / the user something inconsistent.
        console.error("[digest:debit] failed for run", digestRunId, err);
      }
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
      metadata: runMetadata,
    })
    .returning({ id: digestRuns.id });

  // T-304 bonus: auto-heal on a successful manual / sampleNow delivery too.
  if (status === "delivered") {
    await autoHealDeliveryBroken(userId);
    // T-505a: debit even on the legacy / manual sampleNow path so the
    // ledger is consistent regardless of dispatch entry point. Best-effort.
    try {
      await debitForDelivery({
        userId,
        digestRunId: inserted[0]!.id,
        tier: (runMetadata.tier as { resolved?: Tier } | undefined)?.resolved ?? "default",
      });
    } catch (err) {
      console.error("[digest:debit] failed for run", inserted[0]!.id, err);
    }
  }

  return {
    status,
    digestRunId: inserted[0]!.id,
    markdown,
    partsSent,
    telegramMessageId,
  };
}
