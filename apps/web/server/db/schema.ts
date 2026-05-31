import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Minimal users table for T-004 acceptance: `pnpm db:push` creates a `users` table.
 * Full MVP schema (digest_specs, digest_runs, telegram_link_tokens, etc.) lands in T-009.
 *
 * `id` mirrors Supabase Auth's `auth.users.id` so we can join on the same UUID.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
