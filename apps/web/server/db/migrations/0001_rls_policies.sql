-- T-010: Row-Level Security on user-scoped tables
-- Each row's user_id (or id, for the users table) must match auth.uid().
-- Service-role bypasses RLS automatically; the anon and authenticated roles do not.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_self_select" ON "users" FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_self_update" ON "users" FOR UPDATE USING (id = auth.uid());

ALTER TABLE "telegram_link_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_link_tokens_owner_all" ON "telegram_link_tokens"
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE "digest_specs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "digest_specs_owner_all" ON "digest_specs"
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE "chat_threads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_threads_owner_all" ON "chat_threads"
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
-- chat_messages has no user_id column — scoped via thread_id → chat_threads.user_id.
CREATE POLICY "chat_messages_owner_all" ON "chat_messages"
  FOR ALL
  USING (thread_id IN (SELECT id FROM chat_threads WHERE user_id = auth.uid()))
  WITH CHECK (thread_id IN (SELECT id FROM chat_threads WHERE user_id = auth.uid()));

ALTER TABLE "digest_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "digest_runs_owner_all" ON "digest_runs"
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE "feedback_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_events_owner_all" ON "feedback_events"
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE "learning_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_log_owner_all" ON "learning_log"
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE "cost_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_events_owner_select" ON "cost_events"
  FOR SELECT USING (user_id = auth.uid());
-- cost_events writes are service-role only (bypasses RLS); no INSERT/UPDATE policy for end users.

-- Global/shared tables: RLS stays disabled. rss_items and source_cache contain non-
-- user-specific cached data, read/written only by server workers using the service
-- role. If we later expose them to client reads, add explicit policies then.
