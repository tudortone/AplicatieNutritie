-- =============================================================================
-- M5: politica `ai_jobs_user_own` era `FOR ALL` (20260807000001:49-53).
-- Scrierea e blocată doar de REVOKE-ul din 20260806000001:30 — un GRANT viitor
-- ar redeschide scrierea de către utilizator. Corect: SELECT-only (scrierile vin
-- exclusiv de la service_role).
-- =============================================================================
DROP POLICY IF EXISTS ai_jobs_user_own ON ai_jobs;
CREATE POLICY ai_jobs_user_own ON ai_jobs
  FOR SELECT
  USING (auth.uid() = user_id);
