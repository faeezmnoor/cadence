#!/usr/bin/env node
/**
 * T-306 (CAD-41): day-0 smoke spec verification.
 *
 * Run immediately after `seed-smoke-spec.mjs` to confirm:
 *   1. Exactly ONE active smoke spec exists.
 *   2. The owning user has telegram_chat_id set + state=active.
 *   3. The cron matcher would fire on the spec at its declared local time
 *      (verified by computing the next matching UTC minute and checking it
 *      lands within the next 24h).
 *   4. The is_smoke flag is true and the spec is_current=true.
 *
 * Prints a concise PASS / FAIL block — exits non-zero on any failure so it
 * can gate a deploy step.
 */
import postgres from "postgres";
import "dotenv/config";

const OWNER_EMAIL = (process.env.SMOKE_OWNER_EMAIL ?? "faeezmnoor@gmail.com").toLowerCase();

function log(...args) {
  // eslint-disable-next-line no-console
  console.log("[verify-smoke-spec]", ...args);
}

/** Replicates server/cron/match.ts projectToZone — kept inline to avoid TS imports. */
function projectToZone(nowUtc, timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(nowUtc);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return { hhmm: `${hour}:${get("minute")}` };
}

/**
 * Find next UTC minute within the next 24h when projectToZone(minute, tz).hhmm
 * equals the target local time. Returns null if none (shouldn't happen for
 * daily cadence in non-DST tz).
 */
function findNextFireMinute(timezone, deliveryTimeLocal) {
  const nowUtc = new Date();
  const start = new Date(nowUtc.getTime() - (nowUtc.getTime() % 60000));
  for (let i = 0; i < 24 * 60 + 5; i++) {
    const probe = new Date(start.getTime() + i * 60000);
    if (projectToZone(probe, timezone).hhmm === deliveryTimeLocal) {
      return probe;
    }
  }
  return null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log("ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 2 });
  const failures = [];
  try {
    const [owner] = await sql`
      select id, email, timezone, telegram_chat_id, state
      from users
      where lower(email) = ${OWNER_EMAIL}
      limit 1
    `;
    if (!owner) {
      failures.push(`no users row for ${OWNER_EMAIL}`);
      throw new Error("owner missing");
    }
    log("owner_id:", owner.id, "state:", owner.state, "tz:", owner.timezone);
    if (!owner.telegram_chat_id) failures.push("user.telegram_chat_id is null");
    if (owner.state !== "active") failures.push(`user.state is ${owner.state}, want active`);

    const smokeRows = await sql`
      select id, version, is_current, spec
      from digest_specs
      where user_id = ${owner.id} and is_smoke = true
    `;
    if (smokeRows.length === 0) {
      failures.push("no smoke spec found (is_smoke=true)");
      throw new Error("smoke spec missing");
    }
    const currentSmoke = smokeRows.filter((r) => r.is_current);
    if (currentSmoke.length !== 1) {
      failures.push(`expected exactly 1 current smoke spec, found ${currentSmoke.length}`);
    }
    const spec = currentSmoke[0]?.spec ?? smokeRows[0].spec;
    const cadence = spec?.cadence;
    if (!cadence?.delivery_time_local) {
      failures.push("smoke spec missing cadence.delivery_time_local");
    } else {
      const next = findNextFireMinute(owner.timezone, cadence.delivery_time_local);
      if (!next) {
        failures.push(
          `cron matcher would NOT fire spec at local ${cadence.delivery_time_local} ${owner.timezone} in the next 24h (DST hole?)`
        );
      } else {
        const mins = Math.round((next.getTime() - Date.now()) / 60000);
        log(
          `next fire: ${next.toISOString()} UTC (in ~${mins} min, local ${cadence.delivery_time_local} ${owner.timezone})`
        );
      }
    }

    log("smoke_spec_id:", currentSmoke[0]?.id ?? smokeRows[0].id);
  } finally {
    await sql.end({ timeout: 2 });
  }

  if (failures.length > 0) {
    log("FAIL:");
    for (const f of failures) log("  -", f);
    process.exit(1);
  }
  log("PASS: smoke spec is registered, current, and the cron will pick it up.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[verify-smoke-spec] FATAL", err);
  process.exit(1);
});
