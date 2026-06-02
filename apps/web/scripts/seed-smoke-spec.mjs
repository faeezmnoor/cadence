#!/usr/bin/env node
/**
 * T-306 (CAD-41): seed / upsert the self-dogfooded smoke digest_spec.
 *
 * This script is the ONE place that defines the smoke spec contract. Re-run
 * it idempotently after every deploy — it will:
 *   1. Resolve the founder by email (default faeezmnoor@gmail.com, override
 *      with SMOKE_OWNER_EMAIL).
 *   2. Ensure the user row has the right Telegram chat id (default
 *      27643893, override with SMOKE_TELEGRAM_CHAT_ID). Without a chat id
 *      the dispatcher would have nowhere to deliver.
 *   3. Find-or-create a digest_spec marked `is_smoke=true` and set it as
 *      `is_current=true`, demoting any prior current spec for that user.
 *   4. Print the spec id + delivery time so the operator can verify the
 *      next cron tick will pick it up.
 *
 * Cadence: daily at 06:30 MYT (00:30 UTC summer/winter, KL has no DST).
 *   - 06:30 was chosen to NOT clash with Faeez's 07:00 MYT live-commerce
 *     brief (see ~/.openclaw memory: reference_daily_brief_cron.md).
 *
 * Topic: low-volume, low-risk, reliably non-empty. We use the LLM-on-LLM
 *   "AI agent UX patterns" topic because it produces signal every day
 *   without exposing us to commodity-data-source bugs.
 *
 * Kill switch: see docs/SMOKE.md — toggle is_smoke=false on the spec, or
 *   set DELIVERY frequency on the user to paused.
 *
 * Usage:
 *   DATABASE_URL=... node apps/web/scripts/seed-smoke-spec.mjs
 *   DATABASE_URL=... node apps/web/scripts/seed-smoke-spec.mjs --dry-run
 *
 * Exit codes:
 *   0 OK (spec ensured)
 *   1 misconfiguration (missing env)
 *   2 owner email not found in users table — must magic-link sign in first
 */
import postgres from "postgres";
import "dotenv/config";

const OWNER_EMAIL = (process.env.SMOKE_OWNER_EMAIL ?? "faeezmnoor@gmail.com").toLowerCase();
const TELEGRAM_CHAT_ID = Number(process.env.SMOKE_TELEGRAM_CHAT_ID ?? 27643893);
const DELIVERY_TIME_LOCAL = process.env.SMOKE_DELIVERY_TIME_LOCAL ?? "06:30";
const TIMEZONE = process.env.SMOKE_TIMEZONE ?? "Asia/Kuala_Lumpur";
const DRY_RUN = process.argv.includes("--dry-run");

const SMOKE_SPEC = {
  schema_version: 1,
  topics: ["AI agent UX patterns", "OpenAI weekly notes", "Anthropic releases"],
  entities: { companies: ["OpenAI", "Anthropic"], tickers: [], commodities: [] },
  keywords_include: [],
  keywords_exclude: [],
  data_addons: { show_prices: false, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
  rss_feeds: [],
  cadence: {
    frequency: "daily",
    delivery_time_local: DELIVERY_TIME_LOCAL,
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
  },
  tone_preset: "executive_brief",
  length_target: "short",
  language: "en",
};

function log(...args) {
  // eslint-disable-next-line no-console
  console.log("[seed-smoke-spec]", ...args);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log("ERROR: DATABASE_URL not set");
    process.exit(1);
  }
  if (!Number.isFinite(TELEGRAM_CHAT_ID) || TELEGRAM_CHAT_ID <= 0) {
    log("ERROR: SMOKE_TELEGRAM_CHAT_ID is not a positive number:", process.env.SMOKE_TELEGRAM_CHAT_ID);
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 2 });
  try {
    // 1. Resolve owner.
    const [owner] = await sql`
      select id, email, timezone, telegram_chat_id
      from users
      where lower(email) = ${OWNER_EMAIL}
      limit 1
    `;
    if (!owner) {
      log(
        `ERROR: no users row for ${OWNER_EMAIL}. Magic-link sign in once to provision the user, then re-run.`
      );
      process.exit(2);
    }
    log("owner_id:", owner.id);

    // 2. Ensure telegram_chat_id + timezone.
    if (owner.telegram_chat_id !== TELEGRAM_CHAT_ID || owner.timezone !== TIMEZONE) {
      log(
        `updating user: telegram_chat_id ${owner.telegram_chat_id} -> ${TELEGRAM_CHAT_ID}, timezone ${owner.timezone} -> ${TIMEZONE}`
      );
      if (!DRY_RUN) {
        await sql`
          update users
          set telegram_chat_id = ${TELEGRAM_CHAT_ID},
              timezone = ${TIMEZONE},
              state = 'active',
              updated_at = now()
          where id = ${owner.id}
        `;
      }
    } else {
      log("user telegram_chat_id + timezone already correct");
    }

    // 3. Find-or-create the smoke spec. We keep ONE smoke spec per owner
    //    (current=true). If one exists, update its spec in place so seed
    //    edits propagate without churning version numbers.
    const [existing] = await sql`
      select id, version, is_current
      from digest_specs
      where user_id = ${owner.id} and is_smoke = true
      order by version desc
      limit 1
    `;

    if (existing) {
      log("found existing smoke spec:", existing.id, "version", existing.version);
      if (!DRY_RUN) {
        // Demote any non-smoke current spec, promote this one.
        await sql`
          update digest_specs
          set is_current = false, updated_at = now()
          where user_id = ${owner.id} and is_current = true and id <> ${existing.id}
        `;
        await sql`
          update digest_specs
          set spec = ${sql.json(SMOKE_SPEC)},
              is_current = true,
              is_smoke = true,
              updated_at = now()
          where id = ${existing.id}
        `;
      }
      log("smoke spec id:", existing.id);
      log(`delivery: daily at ${DELIVERY_TIME_LOCAL} ${TIMEZONE}`);
      log("done", DRY_RUN ? "(dry-run, no writes)" : "");
      return;
    }

    // No smoke spec yet -> create one.
    const [maxRow] = await sql`
      select coalesce(max(version), 0) as version
      from digest_specs
      where user_id = ${owner.id}
    `;
    const nextVersion = Number(maxRow.version) + 1;
    log("creating new smoke spec at version", nextVersion);
    if (!DRY_RUN) {
      await sql`
        update digest_specs
        set is_current = false, updated_at = now()
        where user_id = ${owner.id} and is_current = true
      `;
      const [created] = await sql`
        insert into digest_specs
          (user_id, version, spec, is_current, created_via, is_smoke)
        values
          (${owner.id}, ${nextVersion}, ${sql.json(SMOKE_SPEC)}, true, 'smoke_seed', true)
        returning id
      `;
      log("smoke spec id:", created.id);
    }
    log(`delivery: daily at ${DELIVERY_TIME_LOCAL} ${TIMEZONE}`);
    log("done", DRY_RUN ? "(dry-run, no writes)" : "");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed-smoke-spec] FATAL", err);
  process.exit(1);
});
