import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  // Don't crash imports in app code; only crash if drizzle-kit is invoked without it.
  console.warn("[drizzle.config] DATABASE_URL is not set. db:* commands will fail until you add it to .env.local");
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
