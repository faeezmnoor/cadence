import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Server-only DB client. Uses the service-role connection string so Inngest
 * workers and tRPC mutations can read/write across user rows.
 *
 * For user-scoped queries from the request lifecycle, prefer the Supabase
 * client (with RLS) over this raw Drizzle client. Use this when you need
 * type-safe queries or trust boundaries are server-controlled (Inngest,
 * cron, webhook handlers).
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production");
}

const sql = postgres(connectionString ?? "postgres://placeholder", {
  prepare: false, // Supabase pooler does not support prepared statements
  max: 10,
});

export const db = drizzle(sql, { schema, casing: "snake_case" });
export type DB = typeof db;
