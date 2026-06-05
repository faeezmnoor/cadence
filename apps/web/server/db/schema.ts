/**
 * Drizzle schema — the canonical TypeScript view of the Cadence Postgres DB.
 *
 * This file is the source of truth that every server-side query types
 * against. The actual DDL ships via SQL migrations in `drizzle/`; keep
 * this file in lockstep when you add a column (write the migration,
 * then mirror the column here so Drizzle queries stay typed).
 *
 * RLS policies and partial indexes live in migration files, not here —
 * Drizzle only models the table shape. Cross-reference `server/ARCHITECTURE.md`
 * for the high-level table → owner module map.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Cadence MVP schema. Tables follow doc 04 (Data Model & APIs).
 *
 * Conventions:
 * - All ids are uuid PK, default gen_random_uuid().
 * - created_at / updated_at are timestamptz with now() defaults.
 * - Soft-delete only on `users` (deleted_at).
 * - RLS policies for these tables land in T-010 (SQL-only, not in Drizzle).
 */

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }).unique(),
    telegramUsername: text("telegram_username"),
    state: text("state").notNull().default("active"), // active | paused | delivery_broken
    distilledPrefs: jsonb("distilled_prefs"),
    /** T-501a: whole credits, 1 credit = 1 brief. May go transiently negative (1-brief debt rule). */
    creditsBalance: integer("credits_balance").notNull().default(0),
    /** T-501a: lifetime sum of cost-to-us in micro-USD (1e-6 USD). Hidden from user. */
    costToUsMicroUsd: bigint("cost_to_us_micro_usd", { mode: "number" }).notNull().default(0),
    /** T-501a: ISO-3166-1 alpha-2 country code; drives MYR vs USD display. */
    countryCode: text("country_code"),
    /** T-501a: v1.5 placeholder — saved auto-top-up pack. NULL = off. */
    autoTopupPackId: text("auto_topup_pack_id"),
    /** T-501a: v1.5 placeholder — credits threshold that triggers auto-top-up. */
    autoTopupThresholdCredits: integer("auto_topup_threshold_credits"),
    /** T-501a: set when 3-credit trial grant fires. Prevents re-grant on re-signup. */
    trialCreditsGrantedAt: timestamp("trial_credits_granted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    stateTzIdx: index("idx_users_state_tz").on(t.state, t.timezone),
  })
);

// ---------------------------------------------------------------------------
// telegram_link_tokens
// ---------------------------------------------------------------------------
export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// digest_specs
// ---------------------------------------------------------------------------
export const digestSpecs = pgTable(
  "digest_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    spec: jsonb("spec").notNull(),
    /**
     * DEPRECATED in migration 0024 — kept nullable so legacy single-brief
     * write paths (digestSpec.updateRaw, save-spec.ts, /spec page, cron
     * fallback) keep working through Phase A. Migration 0025 will drop
     * this column once every caller writes `status` instead.
     */
    isCurrent: boolean("is_current").default(true),
    /**
     * Multi-brief Phase A (migration 0024). Lifecycle:
     *   active     -> scheduled, dispatcher will fire
     *   paused     -> user-paused, no fire, recoverable
     *   archived   -> soft-deleted (UI-hidden, recoverable from version history)
     *   superseded -> reserved for legacy version-history rows
     * DB-level CHECK constraint enforces the vocabulary (see migration 0024).
     */
    status: text("status").notNull().default("active"),
    /** Multi-brief Phase A: user-facing label, e.g. "Palm oil weekly". */
    name: text("name").notNull().default("Untitled brief"),
    /**
     * Multi-brief Phase A: canonical SchedulingRuleV1 jsonb. Validate via
     * `lib/scheduling/rule.ts :: schedulingRuleV1` before insert/update.
     */
    scheduling: jsonb("scheduling").notNull().default(sql`'{}'::jsonb`),
    /**
     * Multi-brief Phase A: materialized hint for dispatcher early-filter.
     * Recomputed via `nextRunAt(scheduling, now)` after each dispatch and
     * on every scheduling edit. NULL for paused/archived rows.
     */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    /** Set when status flips to 'paused'. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    /** Set when status flips to 'archived'. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdVia: text("created_via").notNull(), // chat_agent | manual_edit | smoke_seed
    /**
     * T-306 (CAD-41): mark this spec as a self-dogfooded smoke spec. Smoke
     * specs are dispatched normally by the cron but are reported on by the
     * daily smoke summary cron and ignored by user-facing analytics.
     * Toggle false to silence the smoke without deleting the row.
     */
    isSmoke: boolean("is_smoke").notNull().default(false),
    /**
     * T-401 (CAD-42): when true (default), delivered briefs include the
     * 4-button inline feedback keyboard. Toggle false to silence per spec
     * without losing delivery.
     */
    keyboardEnabled: boolean("keyboard_enabled").notNull().default(true),
    /**
     * CAD-88 (Phase 5.1 Pro Tier alpha): which provider bundle the
     * digest pipeline picks for this spec. CHECK constraint at the DB
     * level restricts to ('default', 'pro'); see migration 0023. The
     * actual swap to Pro providers ALSO requires PRO_TIER_ALPHA=1 at
     * runtime (CAD-85 / getProviders) — so a "pro" spec safely falls
     * back to default until Faeez flips the env flag.
     */
    tier: text("tier").notNull().default("default"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Migration 0024: replaced (user_id, is_current) with (user_id, status)
    // for the "show me my briefs" path (active+paused).
    userStatusIdx: index("idx_digest_specs_user_status")
      .on(t.userId, t.status)
      .where(sql`${t.status} IN ('active', 'paused')`),
    // Migration 0024: dispatcher early-filter on (next_run_at) restricted
    // to active rows that actually have a next run.
    nextRunIdx: index("idx_digest_specs_next_run")
      .on(t.nextRunAt)
      .where(sql`${t.status} = 'active' AND ${t.nextRunAt} IS NOT NULL`),
    smokeIdx: index("idx_digest_specs_is_smoke")
      .on(t.id)
      .where(sql`${t.isSmoke} = true`),
  })
);

// ---------------------------------------------------------------------------
// chat_threads
// ---------------------------------------------------------------------------
export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(), // initial_config | reconfigure
  status: text("status").notNull().default("active"), // active | completed
  // T-408: in-progress DigestSpecDraft so multi-turn edits compose. NULL
  // until first write; cleared back to NULL on successful confirm_and_save.
  draftSpec: jsonb("draft_spec"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// chat_messages
// ---------------------------------------------------------------------------
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | tool
    content: jsonb("content").notNull(),
    // T-413: soft-archive on conversation reset. NULL = visible.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    threadCreatedIdx: index("idx_chat_messages_thread_created").on(t.threadId, t.createdAt),
  })
);

// ---------------------------------------------------------------------------
// digest_runs
// ---------------------------------------------------------------------------
export const digestRuns = pgTable(
  "digest_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    specId: uuid("spec_id")
      .notNull()
      .references(() => digestSpecs.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending"), // pending | composing | delivered | failed
    runDate: date("run_date").notNull(),
    /**
     * The exact UTC minute the cron dispatcher claimed for this run, truncated
     * to second/ms = 0. Idempotency key (with spec_id): two dispatcher fires
     * in the same minute race on the UNIQUE partial index defined in
     * migration 0004; only the row-creator dispatches.
     *
     * Nullable to keep historical sampleNow / pre-Phase-3 rows valid.
     */
    deliveryMinuteUtc: timestamp("delivery_minute_utc", { withTimezone: true }),
    /**
     * CAD-36 follow-up: the user's local calendar day at the moment of the
     * dispatch claim, in the spec's IANA tz. Second idempotency anchor —
     * catches the DST fall-back case where local 01:30 happens twice on
     * different UTC minutes. Nullable for legacy rows.
     */
    deliveryCalendarDayLocal: date("delivery_calendar_day_local"),
    /** T-303 readiness — bumped before each pipeline attempt. */
    attemptCount: integer("attempt_count").notNull().default(0),
    /** T-303 readiness — separate from `error` so the retry path can record
     *  the latest transient failure without overwriting the original. */
    lastError: text("last_error"),
    sourcesBundle: jsonb("sources_bundle"),
    composedMarkdown: text("composed_markdown"),
    /**
     * Stream E #6: 12-char nanoid for public permalink (cadence.app/b/<short_id>).
     * Unique partial index; nullable for backfill safety, but new rows MUST set it.
     */
    shortId: text("short_id"),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    costUsd: numeric("cost_usd", { precision: 10, scale: 5 }),
    error: text("error"),
    /**
     * Evals Phase 0: ad-hoc per-run signals (source-resolve check, manual
     * ratings). Strongly-typed in `apps/web/server/digest/metadata.ts` —
     * jsonb here keeps schema migrations cheap as the eval surface grows.
     */
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // T-302: idempotency contract — one row per (spec, UTC-minute). Partial
    // because legacy rows have NULL delivery_minute_utc.
    specMinuteUq: uniqueIndex("digest_runs_spec_minute_uq")
      .on(t.specId, t.deliveryMinuteUtc)
      .where(sql`${t.deliveryMinuteUtc} IS NOT NULL`),
    // CAD-36 follow-up: catches DST fall-back duplicate-fire (same local day,
    // two distinct UTC minutes).
    specLocalDayUq: uniqueIndex("digest_runs_spec_local_day_uq")
      .on(t.specId, t.deliveryCalendarDayLocal)
      .where(sql`${t.deliveryCalendarDayLocal} IS NOT NULL`),
    userRunDateIdx: index("idx_digest_runs_user_run_date").on(t.userId, t.runDate),
    userCreatedIdx: index("idx_digest_runs_user_created").on(t.userId, t.createdAt.desc()),
    // Stream E #6: lookup by public shortId.
    shortIdUq: uniqueIndex("digest_runs_short_id_uq")
      .on(t.shortId)
      .where(sql`${t.shortId} IS NOT NULL`),
  })
);

// ---------------------------------------------------------------------------
// language_interest_events (Stream E #7)
//
// Captures interest signal when a user taps a "coming July" language chip
// (Bahasa Malaysia, 中文). Until we ship those languages E2E, this is how
// we know who to notify on launch.
// ---------------------------------------------------------------------------
export const languageInterestEvents = pgTable(
  "language_interest_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'ms' | 'zh' */
    languageCode: text("language_code").notNull(),
    /**
     * Explicit email opt-in for the launch-day notify list (QA P2 #2,
     * migration 0021). Pre-0021 rows are null; for those we fall back to
     * users.email at notify time. New rows capture an explicit, editable
     * email from the chat opt-in form.
     */
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("idx_language_interest_events_user_created").on(
      t.userId,
      t.createdAt.desc()
    ),
    langCreatedIdx: index("idx_language_interest_events_lang_created").on(
      t.languageCode,
      t.createdAt.desc()
    ),
  })
);

// ---------------------------------------------------------------------------
// feedback_events
// ---------------------------------------------------------------------------
export const feedbackEvents = pgTable(
  "feedback_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    digestRunId: uuid("digest_run_id")
      .notNull()
      .references(() => digestRuns.id, { onDelete: "cascade" }),
    /** Legacy/free-text signal label. Made nullable in 0006 — callback rows fill `vote`. */
    signalType: text("signal_type"), // thumbs_up | thumbs_down | too_long | more_depth
    /** T-402 (CAD-43): high-level intent from the inline keyboard. up | down | love | skip */
    vote: text("vote"),
    /** T-402: Telegram callback_query.id — UNIQUE for webhook-retry dedupe. */
    telegramCallbackId: text("telegram_callback_id"),
    /** T-402: origin of this signal. inline_keyboard | free_text | tune_command */
    source: text("source").notNull().default("free_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    callbackIdUq: uniqueIndex("feedback_events_telegram_callback_id_uq")
      .on(t.telegramCallbackId)
      .where(sql`${t.telegramCallbackId} IS NOT NULL`),
  })
);

// ---------------------------------------------------------------------------
// learning_log
// ---------------------------------------------------------------------------
export const learningLog = pgTable(
  "learning_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // tune_command | feedback_event | distilled
    rawText: text("raw_text").notNull(),
    distilledAt: timestamp("distilled_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("idx_learning_log_user_created").on(t.userId, t.createdAt.desc()),
  })
);

// ---------------------------------------------------------------------------
// rss_items
// ---------------------------------------------------------------------------
export const rssItems = pgTable(
  "rss_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    specId: uuid("spec_id")
      .notNull()
      .references(() => digestSpecs.id, { onDelete: "cascade" }),
    feedUrl: text("feed_url").notNull(),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    feedGuidUq: uniqueIndex("rss_items_feed_guid_uq").on(t.feedUrl, t.guid),
  })
);

// ---------------------------------------------------------------------------
// source_cache
// ---------------------------------------------------------------------------
export const sourceCache = pgTable(
  "source_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connector: text("connector").notNull(), // brave_search | prices | rss
    key: text("key").notNull(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    connectorKeyUq: uniqueIndex("source_cache_connector_key_uq").on(t.connector, t.key),
  })
);

// ---------------------------------------------------------------------------
// cost_events
// ---------------------------------------------------------------------------
export const costEvents = pgTable("cost_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  digestRunId: uuid("digest_run_id").references(() => digestRuns.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // llm_call | search_api | price_api
  provider: text("provider").notNull(), // anthropic | openai | brave | yfinance
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 5 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// feedback_eval_runs (T-407 / CAD-48)
//
// One row per (user_id, window_end_date). UPSERT semantics from the daily
// 09:30 MYT eval cron — repeated recomputes overwrite rather than append.
// See migration 0009 for column rationale.
// ---------------------------------------------------------------------------
export const feedbackEvalRuns = pgTable(
  "feedback_eval_runs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    windowEndDate: date("window_end_date").notNull(),
    windowDays: integer("window_days").notNull().default(7),
    briefsDeliveredCount: integer("briefs_delivered_count").notNull().default(0),
    keyboardTapsCount: integer("keyboard_taps_count").notNull().default(0),
    /** 0..1, null when briefs_delivered_count = 0 (avoid 0/0 lying as 0%) */
    engagementRate: numeric("engagement_rate", { precision: 6, scale: 4 }),
    /** 0..1, null when keyboard_taps_count = 0 */
    positiveRate: numeric("positive_rate", { precision: 6, scale: 4 }),
    tuneCommandsCount: integer("tune_commands_count").notNull().default(0),
    distilledPrefsPresent: boolean("distilled_prefs_present").notNull().default(false),
    lastBriefAt: timestamp("last_brief_at", { withTimezone: true }),
    lastTapAt: timestamp("last_tap_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.windowEndDate] }),
    windowEndIdx: index("idx_feedback_eval_runs_window_end_date").on(t.windowEndDate.desc()),
  })
);

// ---------------------------------------------------------------------------
// pricing_snapshots (T-501a / T-502a)
//
// Append-only price + FX snapshot. Current pack row has active_to = NULL.
// Price changes write a NEW row + UPDATE the prior current row's active_to.
// `transactions.pricing_snapshot_id` FKs back so every receipt reconciles
// against the snapshot that was active at sale time.
// ---------------------------------------------------------------------------
export const pricingSnapshots = pgTable(
  "pricing_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'taste' | 'standard' | 'power' | 'pro' */
    packId: text("pack_id").notNull(),
    /** 30 | 70 | 200 | 1000 */
    credits: integer("credits").notNull(),
    /** Cents USD. Source of truth for charging. */
    priceMinorUsd: integer("price_minor_usd").notNull(),
    /** Sen MYR. Display value for MY users. */
    priceMinorMyr: integer("price_minor_myr").notNull(),
    /** USD->MYR rate snapshotted at sale time. */
    fxRateUsdToMyr: numeric("fx_rate_usd_to_myr", { precision: 10, scale: 6 }).notNull(),
    /** COGS estimate per credit, micro-USD. */
    costToUsMicroPerCredit: bigint("cost_to_us_micro_per_credit", { mode: "number" }).notNull(),
    activeFrom: timestamp("active_from", { withTimezone: true }).defaultNow().notNull(),
    /** NULL = currently active. */
    activeTo: timestamp("active_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    packActiveIdx: index("idx_pricing_snapshots_pack_active")
      .on(t.packId)
      .where(sql`${t.activeTo} IS NULL`),
  })
);

// ---------------------------------------------------------------------------
// transactions (T-501a)
//
// Credit ledger. `balance_after` is the running balance snapshot post-apply
// — used for UI and audit so we don't need a separate ledger view.
// types: topup | charge | trial_grant | admin_grant | refund | promo
// ---------------------------------------------------------------------------
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** Positive on topup/grant/refund, negative on charge. */
    creditsDelta: integer("credits_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    /** Cents (USD) or sen (MYR). Only on topup / refund. */
    amountMinor: integer("amount_minor"),
    /** 'USD' | 'MYR'. Only on topup / refund. */
    currency: text("currency"),
    fxRateToUsd: numeric("fx_rate_to_usd", { precision: 10, scale: 6 }),
    /** UNIQUE (partial) — Stripe webhook idempotency key. */
    stripeSessionId: text("stripe_session_id"),
    pricingSnapshotId: uuid("pricing_snapshot_id").references(() => pricingSnapshots.id),
    /** Only on type='charge'. */
    digestRunId: uuid("digest_run_id").references(() => digestRuns.id, { onDelete: "set null" }),
    /** Snapshot of our cost for THIS brief, micro-USD. Only on charge. */
    costToUsMicroUsd: bigint("cost_to_us_micro_usd", { mode: "number" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCreatedIdx: index("idx_transactions_user_created").on(t.userId, t.createdAt.desc()),
    stripeSessionUq: uniqueIndex("transactions_stripe_session_id_uq")
      .on(t.stripeSessionId)
      .where(sql`${t.stripeSessionId} IS NOT NULL`),
  })
);

// ---------------------------------------------------------------------------
// account_deletions (PM-audit #11)
//
// Append-only audit log for user-initiated account deletions. user_id is
// NOT a FK because the users row may eventually hard-delete and we still
// want the audit row to survive.
// ---------------------------------------------------------------------------
export const accountDeletions = pgTable(
  "account_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    email: text("email").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("idx_account_deletions_user_id").on(t.userId),
    createdIdx: index("idx_account_deletions_created_at").on(t.createdAt.desc()),
  })
);

// ---------------------------------------------------------------------------
// rate_limits — fixed-window per-user counters for cost-runaway endpoints.
// Migration 0022. Server-only (RLS enabled, no policies = block by default).
// ---------------------------------------------------------------------------
export const rateLimits = pgTable(
  "rate_limits",
  {
    userId: uuid("user_id").notNull(),
    scope: text("scope").notNull(),
    count: integer("count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.scope] }),
  })
);

// Re-export sql for callers that want raw expressions.
export { sql };

// Inferred TS types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type DigestSpec = typeof digestSpecs.$inferSelect;
export type NewDigestSpec = typeof digestSpecs.$inferInsert;
export type DigestRun = typeof digestRuns.$inferSelect;
export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type FeedbackEvent = typeof feedbackEvents.$inferSelect;
export type LearningLogRow = typeof learningLog.$inferSelect;
export type RssItem = typeof rssItems.$inferSelect;
export type SourceCacheRow = typeof sourceCache.$inferSelect;
export type CostEvent = typeof costEvents.$inferSelect;
export type TelegramLinkToken = typeof telegramLinkTokens.$inferSelect;
export type FeedbackEvalRun = typeof feedbackEvalRuns.$inferSelect;
export type NewFeedbackEvalRun = typeof feedbackEvalRuns.$inferInsert;
export type PricingSnapshot = typeof pricingSnapshots.$inferSelect;
export type NewPricingSnapshot = typeof pricingSnapshots.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type AccountDeletion = typeof accountDeletions.$inferSelect;
export type NewAccountDeletion = typeof accountDeletions.$inferInsert;
export type LanguageInterestEvent = typeof languageInterestEvents.$inferSelect;
export type NewLanguageInterestEvent = typeof languageInterestEvents.$inferInsert;
