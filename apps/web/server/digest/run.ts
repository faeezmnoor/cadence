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
import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { costEvents, digestRuns, digestSpecs, learningLog, users } from "@/server/db/schema";
import { buildFeedbackBlock } from "@/server/ai/composer/feedback-block";
import { classifyTopic } from "@/lib/digest-spec/templates";
import { normalizeStack, isAdvancedStack } from "@/lib/research-stack";
import { authorityDomainsForSpec } from "@/server/sources/authority";
import { buildSampleBanner } from "./sample-banner";
import { generateBriefShortId, getBriefShareUrl } from "./share";

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
import {
  telegramAdapter,
  formatPlainText,
  isTelegramConfigured,
  type TelegramTarget,
} from "@/server/channels/telegram";
import { buildFeedbackKeyboard } from "@/server/channels/telegram/keyboard";
import { resolveSearcher, searchWithFallback } from "@/server/ai/providers/searchers";
import { recentRssForSpec } from "@/server/connectors/rss";
import { gatherSources, normalizeSourceUrl } from "@/server/sources";
import { scrapeMpobStocks } from "@/server/sources/scrape/scrapers/mpob-stocks";
import { scrapeBursaCpo } from "@/server/sources/scrape/scrapers/bursa-cpo";
import { scrapeYahooQuote } from "@/server/sources/scrape/scrapers/yahoo-finance-quote";
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
  /**
   * CAD-214 (P0-3): explicit spec target for manual/sample paths. When the
   * dispatcher pre-claimed a row, the claimed row's spec_id wins; when a
   * caller passes specId (e.g. per-brief sample), that spec is used; only
   * with neither do we fall back to the legacy is_current resolution.
   */
  specId?: string;
  /** When true: skip Telegram send even if linked. */
  dryRun?: boolean;
  /** Skip source-fetching errors (Brave key missing etc) and continue with what we have. */
  tolerateSourceFailures?: boolean;
  /**
   * UX P0 #2: which surface invoked the pipeline. Drives the
   * sample-brief banner prepended to the markdown.
   *  - "scheduled": cron path. No banner. Default.
   *  - "sample":    auto-fired post-Telegram-link OR digest.sampleNow
   *                 mutation OR Telegram /sample command. Banner added.
   *
   * Default is "scheduled" so the cron path stays unchanged if a caller
   * forgets to set this — banner is the additive case, not the default.
   */
  trigger?: "scheduled" | "sample";
}

export type RunStatus =
  | "delivered"
  | "composed_dry_run"
  | "no_telegram_link"
  | "no_spec"
  | "duplicate"
  | "failed"
  /** T-505a: balance ≤ −1 at gate-check time. Composer + send skipped. */
  | "skipped_no_credits"
  /**
   * Settings-surfacing v1 (gap 3): user has no Telegram link at gate-check
   * time (unlinked via telegram.unlink, or never linked). Skipped BEFORE
   * any compose cost, debit, or failed-row — deliveries are on hold and
   * no credits are used while disconnected.
   */
  | "skipped_unlinked";

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
 * CAD-221 (S3): entity-aware search-query budget. Topics alone never
 * surfaced competitor/entity news (the audit's competitor-watch failure) —
 * split the same 5-query cap as up-to-2 topics + up-to-3 companies,
 * falling back to all-topics when the spec has no entities. Same spend.
 * Pure; exported for tests.
 */
export function buildSearchQueries(spec: {
  topics?: string[];
  language?: string;
  entities?: { companies?: string[] };
}): string[] {
  // CAD-224 #3: locale context. The bake-off caught Sonar researching US
  // federal procurement for a Malay-language "Government contracts" spec —
  // bare topic strings carry no geography. A Malay-language spec is a
  // Malaysian-market signal, so anchor topic queries with "Malaysia"
  // unless the topic already names it. Company names stay untouched
  // (already specific). Benefits Brave (standard) and Sonar (advanced)
  // alike; A3's inline search reads the full spec and needs no hint.
  // Scoped to "ms" deliberately: Malay is an unambiguous Malaysian-market
  // signal. "zh" is plausible but not certain (SG/TW/HK readers); widen
  // only with founder sign-off (review finding 7 documents the choice).
  const localeHint = spec.language === "ms" ? "Malaysia" : null;
  const withLocale = (topic: string): string =>
    localeHint && !/malaysia/i.test(topic) ? `${topic} ${localeHint}` : topic;
  const topics = (spec.topics ?? []).map(withLocale);
  const companies = (spec.entities?.companies ?? []).filter(
    (c) => c.trim().length >= 3
  );
  // Review P2-12: topics fill whatever the picked companies leave of the
  // 5-query budget (min 2 topics) — a 1-company spec used to drop to 3
  // queries and silently lose topic recall.
  const companyPick = companies.slice(0, 3);
  const topicBudget =
    companyPick.length > 0 ? Math.max(2, 5 - companyPick.length) : 5;
  const picked = [...topics.slice(0, topicBudget), ...companyPick];
  const seen = new Set<string>();
  return picked
    .filter((q) => {
      const k = q.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 5);
}

/**
 * CAD-91: advanced-research footer copy. Exported so tests can lock the
 * exact wording — the badge is user-visible and ties the 3-credit debit
 * to an explanation in the brief itself. (Copy guide vocabulary: depth is
 * "advanced research", never "Pro".)
 */
export const PRO_BADGE_FOOTER = "🔬 Advanced research — deeper digging, 3 credits.";
export const WEBSEARCH_BADGE_FOOTER =
  "🔬 Advanced research — live web search, 5 credits.";

export function appendProBadge(markdown: string, tier: Tier = "pro"): string {
  const footer =
    tier === "pro_websearch" ? WEBSEARCH_BADGE_FOOTER : PRO_BADGE_FOOTER;
  return markdown + "\n\n" + footer;
}

export async function runDigestPipeline(params: RunDigestParams): Promise<RunDigestResult> {
  const { userId, dryRun = false, tolerateSourceFailures = true, digestRunId, trigger = "scheduled" } = params;
  const runDate = params.runDate ?? todayIsoUtc();
  // CAD-213 (P0-2): wall-clock anchor for post-hoc cost-event attribution
  // on the manual path (no pre-claimed run row exists at compose time).
  const pipelineStartedAt = new Date();

  // 1. Load user + current spec
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return { status: "failed", digestRunId: null, markdown: null, partsSent: 0, telegramMessageId: null, error: "user not found" };
  }

  // Settings-surfacing v1 (gap 3): unlinked gate. A user with no Telegram
  // link (disconnected via telegram.unlink, or never linked) gets a clean
  // skip BEFORE source-gathering, composing, claiming, or debiting — no
  // transactions row, no failed-run row, no delivery_broken escalation,
  // no compose cost. The cron dispatcher already skips unlinked users
  // before claiming (cron-dispatch.ts); this is the belt-and-suspenders
  // for races (unlink landing between claim and run) and for manual paths.
  // The claimed row (if the dispatcher raced us) is marked skipped so the
  // admin viewer doesn't see a ghost "pending" row. next_run_at keeps
  // advancing on the dispatcher side, so delivery resumes at the next
  // scheduled occurrence after relink — skipped occurrences are not
  // back-filled. dryRun bypasses: previews don't send, so they don't gate.
  if (!dryRun && user.telegramChatId == null) {
    if (digestRunId) {
      await db
        .update(digestRuns)
        .set({ status: "skipped_unlinked", updatedAt: new Date() })
        .where(eq(digestRuns.id, digestRunId));
    }
    return {
      status: "skipped_unlinked",
      digestRunId: digestRunId ?? null,
      markdown: null,
      partsSent: 0,
      telegramMessageId: null,
    };
  }

  // CAD-214 (P0-3): the dispatcher claims runs PER SPEC — composing "the
  // current" spec instead delivers the wrong brief to any multi-brief user.
  // Resolution order: claimed row's spec_id > explicit params.specId >
  // legacy is_current fallback (single-brief manual/sample paths).
  let targetSpecId: string | null = params.specId ?? null;
  if (digestRunId) {
    const claimedRows = await db
      .select({ specId: digestRuns.specId })
      .from(digestRuns)
      .where(eq(digestRuns.id, digestRunId))
      .limit(1);
    if (claimedRows[0]?.specId) targetSpecId = claimedRows[0].specId;
  }

  // Wave 5 Bug 10: archived briefs must not be sampled. `briefs.archive`
  // (and historical drift) leave `is_current=true` on archived rows; the
  // multi-brief migration introduced `status` as the source of truth.
  // Belt-and-suspenders: require status != archived on BOTH resolution
  // paths so neither write path can resurrect an archived spec.
  const specRows = await db
    .select()
    .from(digestSpecs)
    .where(
      targetSpecId
        ? and(
            eq(digestSpecs.id, targetSpecId),
            eq(digestSpecs.userId, userId),
            ne(digestSpecs.status, "archived")
          )
        : and(
            eq(digestSpecs.userId, userId),
            eq(digestSpecs.isCurrent, true),
            ne(digestSpecs.status, "archived")
          )
    )
    .limit(1);
  const specRow = specRows[0];
  if (!specRow) {
    return { status: "no_spec", digestRunId: null, markdown: null, partsSent: 0, telegramMessageId: null };
  }

  // CAD-220: manual/sample non-dry runs PRE-CLAIM their digest_runs row so
  // (a) the feedback keyboard can attach (callbacks encode the run id —
  // the sample brief must seed the vote habit), and (b) compose/search
  // cost events attribute at write time. The cron path arrives pre-claimed
  // by the dispatcher; dryRun stays rowless by design. Pre-claim failure
  // is non-fatal — we fall back to the legacy insert-after path.
  let runRowId: string | null = digestRunId ?? null;
  if (!dryRun && runRowId == null) {
    try {
      const pre = await db
        .insert(digestRuns)
        .values({
          userId,
          specId: specRow.id,
          status: "composing",
          runDate,
          attemptCount: 0,
        })
        .returning({ id: digestRuns.id });
      runRowId = pre[0]?.id ?? null;
    } catch (err) {
      console.warn("[digest:preclaim]", sanitizeError(err));
    }
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
      if (runRowId) {
        await db
          .update(digestRuns)
          .set({
            status: "skipped_no_credits",
            updatedAt: new Date(),
          })
          .where(eq(digestRuns.id, runRowId));
        await recordSkipForCredits({
          userId,
          digestRunId: runRowId,
          balance: decision.balance,
        });
      }
      // CAD-214: credit exhaustion pauses the SPEC (not the user) so the
      // dispatcher stops firing dead runs, and the user is told instead of
      // silently losing their brief. Resume is on /briefs after top-up;
      // auto-resume-on-grant is Wave 2 polish. Notice is best-effort —
      // never fail the skip path on a send error.
      if (specRow.status === "active") {
        await db
          .update(digestSpecs)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(digestSpecs.id, specRow.id));
        if (isTelegramConfigured() && user.telegramChatId != null) {
          try {
            const notice =
              "Your brief is paused — you're out of credits. " +
              "Add credits, then resume it from your dashboard. Nothing is lost.";
            for (const part of formatPlainText(notice)) {
              await telegramAdapter.send(part, {
                channel: "telegram",
                chatId: Number(user.telegramChatId),
              });
            }
          } catch (noticeErr) {
            console.warn("[digest:pause-notice]", sanitizeError(noticeErr));
          }
        }
      }
      return {
        status: "skipped_no_credits",
        digestRunId: runRowId ?? null,
        markdown: null,
        partsSent: 0,
        telegramMessageId: null,
      };
    }
  }

  // 2. Sources — Brave + RSS. yfinance/prices deferred.
  const sources: ComposerSourcesBundle = { search: [], rss: [] };
  const searchQueries = buildSearchQueries(
    specRow.spec as {
      topics?: string[];
      language?: string;
      entities?: { companies?: string[] };
    }
  );
  // CAD-165: resolve the spec's selected web-search provider (registry in
  // server/ai/providers/searchers.ts) and run it with a keyless DuckDuckGo
  // fallback — a lapsed Brave key or a flaky provider never denies the brief
  // its web search. searchWithFallback never throws; a fully-failed search
  // degrades to no web results and the brief still ships on RSS/scrapers
  // (CAD-102 spirit: research enrichment must never deny the brief).
  const webSearcher = resolveSearcher(specRow.searcher);
  let webSearchFellBack = false;
  for (const query of searchQueries) {
    // CAD-213 (P0-2): attribution to run + user happens inside each provider.
    const { hits, usedFallback } = await searchWithFallback(webSearcher, query, {
      count: 10,
      userId,
      digestRunId: runRowId,
    });
    if (usedFallback) webSearchFellBack = true;
    if (hits.length > 0) sources.search.push({ query, results: hits });
  }

  // CAD-221 (S2): legacy spec-declared RSS is collected into a holding
  // array and folded in AFTER the gathered items below, deduped by
  // normalized URL — gathered items (scrape-first per sources/index.ts)
  // take precedence, and the prompt's head-slice can no longer push the
  // anchor-ICP's price data off the end.
  let legacyRssItems: ComposerSourcesBundle["rss"] = [];
  try {
    legacyRssItems = (await recentRssForSpec(specRow.id, { limit: 30, sinceHours: 48 })).map((r) => ({
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

  // CAD-113 #4: free-data toolbox (Patterns A + C). Adds curated RSS +
  // Pattern A scrape items to the composer's source bundle. DEFAULT tier
  // only — Pro tier (Perplexity Sonar) does its own grounded sourcing.
  // The requested vs resolved tier doesn't matter here: we always gather
  // because a Pro->default downgrade (CAD-89/101/102) still ends up
  // serving via the default composer and benefits from the free items.
  //
  // Telemetry lands on runMetadata.gatheredSources so /admin/cost can
  // answer "how many free items did we feed the default brief today?".
  let gatheredTelemetry: unknown = null;
  try {
    const spec = specRow.spec as {
      topics?: string[];
      topicHint?: string | null;
      keywords_include?: string[];
      entities?: { tickers?: string[]; companies?: string[]; commodities?: string[] };
    };
    const result = await gatherSources(
      {
        topics: spec.topics,
        topicHint: spec.topicHint ?? null,
        // Review P1-7: keywords_include drives the CAD-221 dynamic GNews
        // feeds — gatherSources accepted it from day one but the pipeline
        // never passed it, so half the recall pack only ran in tests.
        keywords: spec.keywords_include ?? [],
        // Wave 4 Bug 9: forward ALL entity buckets, not just tickers. The
        // bucket router uses them for topic detection (e.g. ePerolehan →
        // malaysia + regulatory bucket) and downstream scrapers may key
        // off companies/commodities too.
        entities: {
          tickers: spec.entities?.tickers ?? [],
          companies: spec.entities?.companies ?? [],
          commodities: spec.entities?.commodities ?? [],
        },
      },
      { scrapeMpobStocks, scrapeBursaCpo, scrapeYahooQuote }
    );
    gatheredTelemetry = result.telemetry;
    // Fold into composer's existing rss bundle (the prompt renders it as
    // a flat "RSS items (last 48h)" block — scrape rows render fine there
    // too because all we need is title + url + summary). CAD-221: gathered
    // items lead the block (already scrape-first + deduped internally).
    for (const it of result.items) {
      sources.rss.push({
        feedUrl: it.source_id,
        title: it.title,
        url: it.url,
        publishedAt: it.published_at ?? null,
        summary: it.body_excerpt ?? "",
      });
    }
  } catch (err) {
    // gatherSources promises not to throw, but defend the pipeline anyway.
    console.warn("[digest:gather]", err);
  }

  // CAD-221 (S2): append legacy RSS after gathered items, dropping any URL
  // the gathered set already covers (same article often arrives via both
  // the legacy rss_items path and a curated/gnews feed).
  {
    const seenUrls = new Set(sources.rss.map((r) => normalizeSourceUrl(r.url)));
    for (const item of legacyRssItems) {
      const key = normalizeSourceUrl(item.url);
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      sources.rss.push(item);
    }
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
  // CAD-165: record which web-search provider ran for the Standard step +
  // whether the keyless DuckDuckGo fallback engaged (reliability visibility
  // at /admin). webSearcher/webSearchFellBack are computed in the sources
  // step above.
  runMetadata.webSearch = {
    provider: webSearcher.id,
    fellBackToDuckDuckGo: webSearchFellBack,
  };
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
      // CAD-213 (P0-2): the dispatcher path HAS the claimed run id at
      // compose time — pass it so composer cost_events attribute to the
      // run (margin telemetry + the Pro circuit breaker both join on it).
      // Manual path pre-claims above (CAD-220); only a failed pre-claim
      // still relies on the post-insert back-fill below.
      digestRunId: runRowId,
    };
    // CAD-88: route to the spec's tier. The bundle's resolved `tier` may
    // differ from the spec's `tier` when PRO_TIER_ALPHA is off — the
    // provider layer falls back to default and we record the *resolved*
    // tier on metadata so admins can see which stack actually ran.
    // CAD-222: normalizeStack maps unknown/legacy strings to "default";
    // "pro" and "pro_websearch" pass through. The downgrade ladder below
    // treats BOTH advanced stacks identically (alpha flag, balance,
    // cost cap) — only the provider pair and credit price differ.
    const requestedTier = normalizeStack(specRow.tier) as Tier;
    const requestedAdvanced = isAdvancedStack(requestedTier);

    // CAD-101: alpha-flag safety net. If PRO_TIER_ALPHA is off but a spec
    // still has an advanced tier persisted from a prior window when the
    // flag was on, downgrade silently to default. Belt-and-braces:
    // getProviders already does the same fallback, but doing it here means
    // metadata records the reason and the credit-cost lookup below sees
    // "default". Without this, flipping the flag back off could strand the
    // alpha cohort on an advanced-priced credit cost serving a default brief.
    let alphaSafetyDowngrade = false;
    if (requestedAdvanced && !isProTierAlphaEnabled()) {
      alphaSafetyDowngrade = true;
      console.warn(
        `[digest:tier] user=${userId} spec=${specRow.id} requested=${requestedTier} ` +
          `but PRO_TIER_ALPHA is off — downgrading to default`
      );
    }

    // CAD-89: pragmatic downgrade. If an advanced brief costs 3-5 credits
    // but the user has fewer (positive balance, not broke), don't fail —
    // serve them via the default stack and debit 1. Skip-when-broke
    // (balance ≤ -1) already returned above; the grace credit (balance=0)
    // is handled here too — advanced at balance=0 downgrades to default.
    //
    // dryRun bypasses (no debit on previews; Faeez should see the advanced
    // output regardless of the user's balance).
    let effectiveTier: Tier = requestedTier;
    let downgradeReason: string | null = null;
    if (alphaSafetyDowngrade) {
      effectiveTier = "default";
      downgradeReason = "alpha_flag_off";
    } else if (
      !dryRun &&
      requestedAdvanced &&
      user.creditsBalance < creditCostForTier(requestedTier)
    ) {
      effectiveTier = "default";
      downgradeReason = "insufficient_credits";
      console.warn(
        `[digest:downgrade] user=${userId} balance=${user.creditsBalance} ` +
          `requested=${requestedTier} effective=default reason=${downgradeReason}`
      );
    } else if (requestedAdvanced) {
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
    // CAD-224 review finding 1: stamp tier metadata BEFORE compose so a
    // compose-stage failure still persists which tier this run was
    // dispatched and resolved as — the refund fallback reads it. The
    // richer post-compose assignment below overwrites with composer ids.
    runMetadata.tier = {
      requested: requestedTier,
      resolved: providers.tier,
    };

    // CAD-222 (A1) / platform-audit P0-1: the advanced tier finally RUNS
    // its research. Gated on the RESOLVED tier (post-downgrade) so an
    // alpha-off / broke / cost-capped run never spends Sonar money.
    // Mirrors the bake-off A2 gather (scripts/pro-bakeoff.ts) so the
    // bake-off measures exactly what production does: top-3 queries,
    // per-query memos joined under `### query` headers, joined cap 8000.
    // Best-effort — a Sonar failure degrades to the Brave+RSS bundle
    // already gathered above (CAD-102 spirit: research enrichment must
    // never deny the brief).
    if (providers.tier === "pro") {
      const PRO_SEARCH_MAX_QUERIES = 3;
      const PRO_MEMO_JOIN_CAP_CHARS = 8_000;
      // Review P1-4: each Sonar call can legitimately run up to 120s
      // (REQUEST_TIMEOUT_MS) — three back-to-back slow-tail calls alone
      // would blow the route's 300s Inngest budget before the composer
      // even starts. Issue a FURTHER query only while elapsed search time
      // is under this budget; one in-flight slow call past it caps the
      // phase at ~budget+120s, leaving headroom for compose + delivery.
      const PRO_SEARCH_ISSUE_BUDGET_MS = 60_000;
      const proSearchStartedAt = Date.now();
      let proSearchTruncated = 0;
      try {
        const memos: string[] = [];
        const proQueries = searchQueries.slice(0, PRO_SEARCH_MAX_QUERIES);
        // CAD-226: steer Sonar toward primary publishers for this spec.
        const authorityDomains = authorityDomainsForSpec(
          specRow.spec as Parameters<typeof authorityDomainsForSpec>[0]
        );
        for (const query of proQueries) {
          if (Date.now() - proSearchStartedAt > PRO_SEARCH_ISSUE_BUDGET_MS) {
            proSearchTruncated++;
            continue;
          }
          const resp = await providers.search.search(query, {
            count: 8,
            userId,
            digestRunId: runRowId,
            authorityDomains,
          });
          sources.search.push({
            query,
            results: resp.results.map((r) => ({
              title: r.title,
              url: r.url,
              description: r.snippet,
              age: r.publishedAt,
            })),
          });
          if (resp.memo) memos.push(`### ${query}\n${resp.memo}`);
        }
        const joinedMemo = memos
          .join("\n\n---\n\n")
          .slice(0, PRO_MEMO_JOIN_CAP_CHARS);
        if (joinedMemo) composerInput.researchMemo = joinedMemo;
        runMetadata.proSearch = {
          provider: providers.search.id,
          queries: proQueries.length - proSearchTruncated,
          // No silent caps: surfaced so /admin can see when the time
          // budget cut research short (review P1-4).
          truncatedByTimeBudget: proSearchTruncated,
          memoChars: joinedMemo.length,
        };
      } catch (proSearchErr) {
        const reason = sanitizeError(proSearchErr);
        console.warn(`[digest:pro-search] user=${userId} degrading to gathered sources — ${reason}`);
        runMetadata.proSearch = { error: reason };
      }
    }

    let out: Awaited<ReturnType<typeof providers.composer.compose>>;
    try {
      out = await providers.composer.compose(composerInput);
    } catch (composerErr) {
      // CAD-102 (T3): advanced composer failure → fallback to the default
      // composer so a flaky Sonar/Sonnet/web-search call doesn't deny the
      // user their brief entirely. Only catches advanced→default; a default
      // composer failure re-throws and lands in the outer catch below so
      // the pipeline can retry or escalate to delivery_broken.
      //
      // The user gets a default brief (no 🔬 footer, debited at 1 credit
      // via the resolved=default tier downstream), and the failure is
      // captured in Sentry + stamped on runMetadata.fallback so admins
      // can see the rate of advanced→default fallbacks without trawling logs.
      if (!isAdvancedStack(providers.tier)) {
        throw composerErr;
      }
      const failedTier = providers.tier;
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(composerErr, {
        tags: { route: "digest.compose", tier: failedTier },
        extra: { userId, digestRunId: runRowId },
      });
      const reason = sanitizeError(composerErr);
      console.warn(
        `[digest:fallback] user=${userId} ${failedTier} composer failed, retrying on default — ${reason}`
      );
      providers = getProviders("default");
      out = await providers.composer.compose(composerInput);
      runMetadata.fallback = {
        from: failedTier,
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
    // CAD-113 #4: stamp free-data telemetry so /admin/cost can show how
    // many free items each default brief consumed. Null when gather threw.
    if (gatheredTelemetry !== null) {
      runMetadata.gatheredSources = gatheredTelemetry;
    }
    if (downgradeReason) {
      // CAD-89: per spec, downgrade reason lands on digestRuns.metadata
      // so the admin run viewer can surface "downgraded from advanced"
      // without joining transactions.
      runMetadata.downgrade = {
        from: requestedTier,
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

    // Ticket 2 (missing-capability telemetry): flag low-confidence briefs
    // so /admin/missing-capabilities can surface "we delivered, but only
    // barely" — the highest-signal demand for new data sources. Triggers:
    //   - source-resolve rate < 0.8, OR
    //   - fewer than 2 sources actually resolved, OR
    //   - section_count < 2 (composer hit the loosened min(1) floor).
    // Pure additive metadata; never blocks delivery.
    try {
      const brief = out.brief as BriefJson;
      const sourceResolve = runMetadata.sourceResolve as
        | { rate: number; results: SourceResolveResult[] }
        | undefined;
      const rate = sourceResolve?.rate ?? 1;
      const resolvedCount = sourceResolve?.results
        ? sourceResolve.results.filter((r) => r.resolved).length
        : brief.sources.length;
      const sectionCount = brief.sections.length;
      const reasons: string[] = [];
      if (rate < 0.8) reasons.push("source_resolve_rate_below_80pct");
      if (resolvedCount < 2) reasons.push("fewer_than_2_resolved_sources");
      if (sectionCount < 2) reasons.push("thin_signal_single_section");
      if (reasons.length > 0) {
        runMetadata.lowConfidence = {
          reason: reasons.join(","),
          source_resolve_rate: rate,
          resolved_count: resolvedCount,
          section_count: sectionCount,
          flaggedAt: new Date().toISOString(),
        };
        console.warn(
          `[digest:lowConfidence] user=${userId} reasons=${reasons.join("|")} ` +
            `rate=${(rate * 100).toFixed(0)}% resolved=${resolvedCount} sections=${sectionCount}`
        );
      }
    } catch (err) {
      console.warn("[digest:lowConfidence] unexpectedly threw:", err);
    }

    // Ticket 3 (topic-match telemetry): classify the spec's topics against
    // the curated template library so /admin/missing-capabilities can
    // answer "what % of new specs match a template vs are off-template?".
    // Pure keyword match — sync, no LLM call, zero added latency.
    try {
      const spec = specRow.spec as {
        topics?: string[];
        topicHint?: string;
      };
      const classification = classifyTopic({
        topics: spec.topics,
        topicHint: spec.topicHint,
      });
      runMetadata.specSubmittedTopic = {
        templateId: classification.templateId,
        matched: classification.matched,
        rawTopics: (spec.topics ?? []).slice(0, 10),
      };
    } catch (err) {
      console.warn("[digest:specSubmittedTopic] unexpectedly threw:", err);
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
    // CAD-217/218: the pipeline's failure path was Sentry-silent — the
    // audit's silent-overnight-failure class. Best-effort capture.
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(err, {
        tags: { route: "digest.pipeline" },
        extra: { userId, digestRunId: runRowId, errorClass },
      });
    } catch {
      // Sentry-optional.
    }
    // Persist failed run for visibility. T-302/T-303: prefer UPDATE on the
    // claimed row and atomically bump attempt_count via SQL so retries
    // never race-clobber the counter.
    if (runRowId) {
      const updated = await db
        .update(digestRuns)
        .set({
          status: "failed",
          error,
          lastError: error,
          // CAD-224 review finding 1: failed runs must carry their tier
          // metadata too — the refund fallback prices off it.
          metadata: runMetadata,
          attemptCount: sql`${digestRuns.attemptCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(digestRuns.id, runRowId))
        .returning({ attemptCount: digestRuns.attemptCount });
      return {
        status: "failed",
        digestRunId: runRowId,
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
        metadata: runMetadata,
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
    // The balance going into this brief — debit not yet applied. Subtract
    // the RESOLVED stack's real price (review P2-8: a hardcoded -1 made an
    // advanced delivery's footer reason from a balance 2-4 credits too
    // high, missing the paywall nudge exactly when it mattered).
    const footerTier =
      (runMetadata.tier as { resolved?: Tier } | undefined)?.resolved ??
      "default";
    const projectedBalance =
      user.creditsBalance - creditCostForTier(footerTier);
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

  // CAD-91: 🔬 advanced badge. Only emitted when the brief was actually
  // composed on an advanced stack (resolved tier, not requested —
  // downgraded briefs MUST NOT carry the badge). The footer names the
  // stack's own credit price so the user can tie the brief back to the
  // exact charge.
  const resolvedTier = (runMetadata.tier as { resolved?: Tier } | undefined)?.resolved;
  if (resolvedTier && isAdvancedStack(resolvedTier)) {
    markdown = appendProBadge(markdown, resolvedTier);
  }

  // UX P0 #2: prepend sample-brief banner (sample trigger only). Cron path
  // stays untouched. The banner sits at the very top of the message so the
  // user reads it before scanning the brief body — the goal is anchoring
  // "this is a one-off taste; your real briefs land on schedule" inside the
  // first 5 seconds of their first Cadence delivery.
  if (trigger === "sample") {
    const spec = specRow.spec as {
      cadence?: { frequency?: Cadence; delivery_time_local?: string };
    };
    const banner = buildSampleBanner({
      frequency: spec.cadence?.frequency ?? "daily",
      deliveryTimeLocal: spec.cadence?.delivery_time_local ?? null,
      timezone: user.timezone ?? null,
    });
    markdown = banner + markdown;
  }

  // Multi-brief Phase A UI ticket 3: brief-name footer.
  //
  // When the user has more than one active or paused brief, prepend a
  // "From your <brief-name> brief." line BEFORE the share-link footer so
  // every Telegram delivery identifies which brief it belongs to. Single-
  // brief users keep the clean footer (no point shouting the name when
  // there's only one channel of context).
  //
  // We count from digest_specs rather than caching on the user — a user
  // could pause their second brief between scheduling and dispatch and we
  // want the footer to reflect reality at send time. The count is a
  // single small index hit on (user_id, status) so it's cheap.
  let activeBriefCount = 0;
  if (!dryRun && trigger !== "sample") {
    const countRows = await db
      .select({ id: digestSpecs.id })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, userId),
          inArray(digestSpecs.status, ["active", "paused"])
        )
      );
    activeBriefCount = countRows.length;
  }
  if (activeBriefCount > 1) {
    const briefName = (specRow.name ?? "").trim();
    if (briefName.length > 0) {
      markdown = markdown + `\n\n🦞 From your *${briefName}* brief.`;
    }
  }

  // UX v2 P0 #5: share-link footer. Generate the per-brief shortId once,
  // append the public permalink to the markdown, persist the shortId on
  // the digest_runs row so /b/<shortId> resolves. Skip for dry-run (no
  // row persisted) and for sample briefs (the sample banner already owns
  // the framing; we don't want the user sharing a one-off sample as their
  // "real" brief).
  const briefShortId =
    !dryRun && trigger !== "sample" ? generateBriefShortId() : null;
  if (briefShortId) {
    markdown =
      markdown + `\n\n📎 Share this brief: ${getBriefShareUrl(briefShortId)}`;
  }

  // 4. Format for the delivery channel (CAD-207: via the channel adapter)
  const parts = telegramAdapter.format({ markdown });

  // 5. Deliver or skip
  let telegramMessageId: number | null = null;
  let partsSent = 0;
  let status: RunStatus;
  const canSend = !dryRun && isTelegramConfigured() && user.telegramChatId != null;
  if (canSend) {
    try {
      const target: TelegramTarget = {
        channel: "telegram",
        chatId: Number(user.telegramChatId),
      };
      // T-401 (CAD-42): attach inline-keyboard ONLY to the final part, and
      // ONLY when:
      //   - the spec has keyboard_enabled = true (per-spec opt-in), and
      //   - we have a run row id (cron pre-claimed, or CAD-220 pre-claim
      //     on the manual/sample path — samples seed the vote habit).
      // Manual sampleNow path (no pre-claimed id) skips the keyboard —
      // dev-time previews don't need feedback collection.
      const keyboardOn = specRow.keyboardEnabled && runRowId != null;
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        const replyMarkup =
          keyboardOn && isLast ? buildFeedbackKeyboard(runRowId!) : undefined;
        // adapter.send carries the parse-mode fallback (CAD bug 2026-06-05):
        // if the composer emits malformed Markdown (unbalanced
        // `*`/`_`/`` ` ``/`[]()`), Telegram rejects with 400 "can't parse
        // entities" and the same body is retried as plain text so the user
        // still gets the brief (unformatted) instead of nothing. Any other
        // error re-throws into the outer catch below.
        const receipt = await telegramAdapter.send(
          replyMarkup ? { ...parts[i], replyMarkup } : parts[i],
          target
        );
        if (telegramMessageId == null) telegramMessageId = receipt.messageId;
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
      if (runRowId) {
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
          .where(eq(digestRuns.id, runRowId))
          .returning({ attemptCount: digestRuns.attemptCount });
        return {
          status: "failed",
          digestRunId: runRowId,
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
  if (runRowId) {
    await db
      .update(digestRuns)
      .set({
        status: status === "delivered" ? "delivered" : "composing",
        composedMarkdown: markdown,
        sourcesBundle: sources,
        telegramMessageId: telegramMessageId ?? undefined,
        costUsd: composeCostUsd.toString(),
        metadata: runMetadata,
        ...(briefShortId ? { shortId: briefShortId } : {}),
        // T-303: bump attempt_count atomically. On a fresh row this goes
        // 0 -> 1; on a retry of a previously-failed claim this records the
        // attempt count at which we succeeded (visible in T-304 admin viewer).
        // We do NOT clear last_error on success — keep the diagnostic trail.
        attemptCount: sql`${digestRuns.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(digestRuns.id, runRowId));

    // T-304 bonus: auto-heal delivery_broken on success. No-op if active.
    // Future per-spec rows naturally start with attempt_count=0; we don't
    // need to touch the just-updated row's counter.
    if (status === "delivered") {
      await autoHealDeliveryBroken(userId);
      // T-505a: per-brief debit. Runs ONLY after a confirmed Telegram
      // delivery so we never charge for a failed send. The 1-brief grace
      // rule means balance may go to −1 here; that's expected — the next
      // dispatch will hit the skip gate.
      //
      // CAD-212: sample briefs are on us — they exist to seed the vote
      // habit, not to spend the trial. Cron path never has trigger=sample,
      // so scheduled economics are unchanged.
      if (trigger !== "sample") {
        try {
          await debitForDelivery({
            userId,
            digestRunId: runRowId,
            // CAD-89: debit by RESOLVED tier (post-downgrade).
            tier: (runMetadata.tier as { resolved?: Tier } | undefined)?.resolved ?? "default",
          });
        } catch (err) {
          // Never break a successful delivery on debit failure. Log and
          // accept that this brief flew free — preferable to telling Stripe
          // / the user something inconsistent.
          console.error("[digest:debit] failed for run", runRowId, err);
        }
      }
    }

    return {
      status,
      digestRunId: runRowId,
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
      ...(briefShortId ? { shortId: briefShortId } : {}),
    })
    .returning({ id: digestRuns.id });

  // CAD-213 (P0-2): the manual path has no run id at compose time, so the
  // composer/Brave cost_events for THIS pipeline invocation were written
  // with digest_run_id NULL. Back-fill them now that the row exists. The
  // (userId, NULL, since-start) scope is safe at current concurrency — a
  // user does not run two manual pipelines in the same instant; revisit
  // with a pre-claimed row if that ever changes. Best-effort.
  try {
    await db
      .update(costEvents)
      .set({ digestRunId: inserted[0]!.id })
      .where(
        and(
          eq(costEvents.userId, userId),
          isNull(costEvents.digestRunId),
          gte(costEvents.createdAt, pipelineStartedAt)
        )
      );
  } catch (err) {
    console.warn("[digest:cost-backfill] failed for run", inserted[0]!.id, err);
  }

  // T-304 bonus: auto-heal on a successful manual / sampleNow delivery too.
  if (status === "delivered") {
    await autoHealDeliveryBroken(userId);
    // T-505a: debit even on the legacy / manual sampleNow path so the
    // ledger is consistent regardless of dispatch entry point. Best-effort.
    // CAD-212: sample briefs are free — see the cron-path note above.
    if (trigger !== "sample") {
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
  }

  return {
    status,
    digestRunId: inserted[0]!.id,
    markdown,
    partsSent,
    telegramMessageId,
  };
}
