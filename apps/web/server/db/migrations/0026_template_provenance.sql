-- 0026: template provenance (brief-creation revamp PR 1).
--
-- Adds nullable template_id to chat_threads and digest_specs so the
-- freehand-vs-template share and per-template D7/👍 segmentation are
-- queryable (the starter-trio swap trigger from
-- proposals/brief-creation-flow-proposal.md §8.1).
--
-- Values are lib/digest-spec/templates.ts ids (free text, no FK — the
-- catalog lives in code, ids are stable by convention). NULL = freehand.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS only; no backfill (historical rows
-- are honestly freehand/unknown).

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE digest_specs ADD COLUMN IF NOT EXISTS template_id text;

COMMENT ON COLUMN chat_threads.template_id IS
  'Catalog template id that started this thread (templates.ts). NULL = freehand.';
COMMENT ON COLUMN digest_specs.template_id IS
  'Copied from chat_threads.template_id at confirm_and_save. NULL = freehand.';
