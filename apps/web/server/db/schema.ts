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
    createdVia: text("created_via").notNull(), // chat_agent | manual_edit
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCurrentIdx: index("idx_digest_specs_user_current").on(t.userId, t.isCurrent),
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
    sourcesBundle: jsonb("sources_bundle"),
    composedMarkdown: text("composed_markdown"),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    costUsd: numeric("cost_usd", { precision: 10, scale: 5 }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userRunDateUq: uniqueIndex("digest_runs_user_run_date_uq").on(t.userId, t.runDate),
    userCreatedIdx: index("idx_digest_runs_user_created").on(t.userId, t.createdAt.desc()),
  })
);

// ---------------------------------------------------------------------------
// feedback_events
// ---------------------------------------------------------------------------
export const feedbackEvents = pgTable("feedback_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  digestRunId: uuid("digest_run_id")
    .notNull()
    .references(() => digestRuns.id, { onDelete: "cascade" }),
  signalType: text("signal_type").notNull(), // thumbs_up | thumbs_down | too_long | more_depth
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
