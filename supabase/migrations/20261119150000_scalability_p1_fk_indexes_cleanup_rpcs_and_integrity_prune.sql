-- ==============================================================================
-- SCALABILITY P1: GDPR FK/user_id indexes, drop unused GIN index,
-- batched cleanup RPCs (LIMIT 5000), and probabilistic Play Integrity pruning.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 7 missing FK / user_id indexes for GDPR delete/export + drop unused GIN
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_created_at
  ON public.ai_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_play_rtdn_events_token_hash
  ON public.google_play_rtdn_events (purchase_token_hash);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id
  ON public.user_feedback (user_id);

CREATE INDEX IF NOT EXISTS idx_credite_esuate_app_user_id
  ON public.credite_esuate (app_user_id);

CREATE INDEX IF NOT EXISTS idx_barcode_cache_created_by_user
  ON public.barcode_cache (created_by_user)
  WHERE created_by_user IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photo_outcome_resolutions_user_id
  ON public.photo_outcome_resolutions (user_id);

CREATE INDEX IF NOT EXISTS idx_photo_outcome_resolutions_resolved_by
  ON public.photo_outcome_resolutions (resolved_by)
  WHERE resolved_by IS NOT NULL;

DROP INDEX IF EXISTS public.idx_mese_alimente_gin;

-- ------------------------------------------------------------------------------
-- 2. Dedicated cleanup indexes + batched cleanup RPCs (LIMIT 5000)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_jobs_cleanup_created_at
  ON public.ai_jobs (created_at)
  WHERE status IN ('succeeded', 'completed', 'failed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_flow_reward_intent_secrets_created_at
  ON public.flow_reward_intent_secrets (created_at);

CREATE INDEX IF NOT EXISTS idx_flow_reward_intents_created_at
  ON public.flow_reward_intents (created_at);

CREATE INDEX IF NOT EXISTS idx_google_play_rtdn_events_cleanup_created_at
  ON public.google_play_rtdn_events (created_at)
  WHERE processing_status IN ('processed', 'ignored', 'permanent_error');

CREATE INDEX IF NOT EXISTS idx_flow_credit_reservations_result_settled_at
  ON public.flow_credit_reservations (settled_at)
  WHERE status IN ('COMMITTED', 'RELEASED') AND result IS NOT NULL;

CREATE OR REPLACE FUNCTION public.curata_ai_jobs_vechi(
  p_vreme_zile integer DEFAULT 30,
  p_batch_size integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
  v_days integer := GREATEST(COALESCE(p_vreme_zile, 30), 1);
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 5000), 1), 5000);
BEGIN
  WITH batch AS (
    SELECT id
    FROM public.ai_jobs
    WHERE status IN ('succeeded', 'completed', 'failed', 'cancelled')
      AND created_at < now() - make_interval(days => v_days)
    ORDER BY created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.ai_jobs AS target
  USING batch
  WHERE target.id = batch.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.curata_flow_reward_intent_secrets_vechi(
  p_vreme_ore integer DEFAULT 24,
  p_batch_size integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
  v_hours integer := GREATEST(COALESCE(p_vreme_ore, 24), 1);
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 5000), 1), 5000);
BEGIN
  WITH batch AS (
    SELECT intent_id
    FROM public.flow_reward_intent_secrets
    WHERE created_at < now() - make_interval(hours => v_hours)
    ORDER BY created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.flow_reward_intent_secrets AS target
  USING batch
  WHERE target.intent_id = batch.intent_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.curata_flow_reward_intents_vechi(
  p_vreme_zile integer DEFAULT 30,
  p_batch_size integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
  v_days integer := GREATEST(COALESCE(p_vreme_zile, 30), 1);
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 5000), 1), 5000);
BEGIN
  WITH batch AS (
    SELECT id
    FROM public.flow_reward_intents
    WHERE created_at < now() - make_interval(days => v_days)
      AND (status <> 'PENDING' OR expires_at < now())
    ORDER BY created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.flow_reward_intents AS target
  USING batch
  WHERE target.id = batch.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.curata_google_play_rtdn_events_vechi(
  p_vreme_zile integer DEFAULT 90,
  p_batch_size integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
  v_days integer := GREATEST(COALESCE(p_vreme_zile, 90), 1);
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 5000), 1), 5000);
BEGIN
  WITH batch AS (
    SELECT message_id
    FROM public.google_play_rtdn_events
    WHERE processing_status IN ('processed', 'ignored', 'permanent_error')
      AND created_at < now() - make_interval(days => v_days)
    ORDER BY created_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.google_play_rtdn_events AS target
  USING batch
  WHERE target.message_id = batch.message_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.curata_flow_credit_reservations_result_vechi(
  p_vreme_zile integer DEFAULT 14,
  p_batch_size integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated integer := 0;
  v_days integer := GREATEST(COALESCE(p_vreme_zile, 14), 1);
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 5000), 1), 5000);
BEGIN
  WITH batch AS (
    SELECT id
    FROM public.flow_credit_reservations
    WHERE status IN ('COMMITTED', 'RELEASED')
      AND result IS NOT NULL
      AND settled_at < now() - make_interval(days => v_days)
    ORDER BY settled_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.flow_credit_reservations AS target
  SET result = NULL
  FROM batch
  WHERE target.id = batch.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.curata_ai_jobs_vechi(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curata_ai_jobs_vechi(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.curata_flow_reward_intent_secrets_vechi(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curata_flow_reward_intent_secrets_vechi(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.curata_flow_reward_intents_vechi(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curata_flow_reward_intents_vechi(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.curata_google_play_rtdn_events_vechi(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curata_google_play_rtdn_events_vechi(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.curata_flow_credit_reservations_result_vechi(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curata_flow_credit_reservations_result_vechi(integer, integer)
  TO service_role;

-- Optional pg_cron scheduling (idempotent when extension is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname IN (
      'nutriai-curata-ai-jobs',
      'nutriai-curata-reward-secrets',
      'nutriai-curata-reward-intents',
      'nutriai-curata-rtdn-events',
      'nutriai-curata-photo-results'
    );

    PERFORM cron.schedule('nutriai-curata-ai-jobs', '15 3 * * *', $sql$SELECT public.curata_ai_jobs_vechi(30, 5000);$sql$);
    PERFORM cron.schedule('nutriai-curata-reward-secrets', '20 * * * *', $sql$SELECT public.curata_flow_reward_intent_secrets_vechi(24, 5000);$sql$);
    PERFORM cron.schedule('nutriai-curata-reward-intents', '30 3 * * *', $sql$SELECT public.curata_flow_reward_intents_vechi(30, 5000);$sql$);
    PERFORM cron.schedule('nutriai-curata-rtdn-events', '45 3 * * *', $sql$SELECT public.curata_google_play_rtdn_events_vechi(90, 5000);$sql$);
    PERFORM cron.schedule('nutriai-curata-photo-results', '55 3 * * *', $sql$SELECT public.curata_flow_credit_reservations_result_vechi(14, 5000);$sql$);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. claim_play_integrity_token: probabilistic inline prune (5%) + SKIP LOCKED
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_play_integrity_token(
  p_token_hash text,
  p_request_hash text,
  p_user_id text,
  p_content_digest text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inserted integer;
  v_existing public.play_integrity_token_bindings%ROWTYPE;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$'
    OR NULLIF(btrim(p_request_hash), '') IS NULL
    OR NULLIF(btrim(p_user_id), '') IS NULL
    OR p_expires_at IS NULL
    OR p_expires_at <= now() THEN
    RETURN false;
  END IF;

  IF random() < 0.05 THEN
    WITH expired AS (
      SELECT token_hash
      FROM public.play_integrity_token_bindings
      WHERE expires_at <= now()
      ORDER BY expires_at
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM public.play_integrity_token_bindings AS bindings
    USING expired
    WHERE bindings.token_hash = expired.token_hash;
  END IF;

  INSERT INTO public.play_integrity_token_bindings (
    token_hash, user_id, request_hash, content_digest, expires_at
  ) VALUES (
    p_token_hash, p_user_id, p_request_hash, p_content_digest, p_expires_at
  )
  ON CONFLICT (token_hash) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN true;
  END IF;

  SELECT * INTO v_existing
  FROM public.play_integrity_token_bindings
  WHERE token_hash = p_token_hash;

  RETURN FOUND
    AND v_existing.expires_at > now()
    AND v_existing.user_id = p_user_id
    AND v_existing.request_hash = p_request_hash
    AND v_existing.content_digest IS NOT DISTINCT FROM p_content_digest;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_play_integrity_token(text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_play_integrity_token(text, text, text, text, timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
