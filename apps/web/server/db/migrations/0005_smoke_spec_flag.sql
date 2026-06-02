-- Phase 3 / T-306 (CAD-41): self-dogfooded smoke spec flag.
--
-- We continuously dogfood the Phase 3 infra (tz cron + idempotency + retry +
-- auto-heal + admin viewer) by running ONE digest_spec owned by the founder
-- on a low-volume topic, 24/7. The flag lets us:
--   - distinguish synthetic dogfood specs from real user specs in the admin
--     viewer (so growth/health metrics don't get polluted),
--   - target the daily observability summary cron at exactly those specs,
--   - kill-switch the smoke without deleting the spec (set is_smoke=false).
--
-- Default false — existing rows and all future real-user specs are NOT smoke.

ALTER TABLE "digest_specs"
  ADD COLUMN IF NOT EXISTS "is_smoke" boolean NOT NULL DEFAULT false;

-- Partial index: keep the smoke summary cron's "find all smoke specs" lookup
-- fast even as digest_specs grows. Partial because the overwhelming majority
-- of rows will have is_smoke=false.
CREATE INDEX IF NOT EXISTS "idx_digest_specs_is_smoke"
  ON "digest_specs" ("id")
  WHERE "is_smoke" = true;
