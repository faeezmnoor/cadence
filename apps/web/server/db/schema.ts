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
    isCurrent: boolean("is_current").notNull().default(true),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCurrentIdx: index("idx_digest_specs_user_current").on(t.userId, t.isCurrent),
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
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    costUsd: numeric("cost_usd", { precision: 10, scale: 5 }),
    error: text("error"),
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

// Re-export sql for callers that want raw expressions.
export { sql };

// Inferred TS types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type DigestSpec = typeof digestSpecs.$inferSelect;
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
