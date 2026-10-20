-- Persist ambiguous Photo outcomes without blocking distinct operations. Only
-- a service-role reconciliation with confirmed-failure evidence may release one.
ALTER TABLE public.flow_credit_reservations
  ADD COLUMN IF NOT EXISTS outcome_unknown_at timestamptz;

UPDATE public.flow_credit_reservations AS reservation
SET outcome_unknown_at = COALESCE(reservation.inference_claimed_at, reservation.created_at)
WHERE reservation.status = 'RESERVED'
  AND reservation.inference_claimed_at IS NOT NULL
  AND reservation.result IS NULL
  AND EXISTS (
    SELECT 1 FROM public.ai_jobs AS job
    WHERE job.user_id = reservation.user_id
      AND job.credit_reservation_id = reservation.id
      AND job.status = 'failed'
      AND job.error_code = 'PHOTO_OUTCOME_UNKNOWN'
  );

CREATE UNIQUE INDEX IF NOT EXISTS flow_credit_one_active_per_user_v2
  ON public.flow_credit_reservations(user_id)
  WHERE status = 'RESERVED' AND outcome_unknown_at IS NULL;
DROP INDEX IF EXISTS public.flow_credit_one_active_per_user;

CREATE INDEX IF NOT EXISTS flow_credit_photo_outcome_unknown_idx
  ON public.flow_credit_reservations(outcome_unknown_at)
  WHERE status = 'RESERVED' AND outcome_unknown_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.photo_outcome_resolutions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.flow_credit_reservations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resolution text NOT NULL CHECK (resolution = 'CONFIRMED_FAILURE'),
  evidence_reference text NOT NULL CHECK (evidence_reference ~ '^[A-Za-z0-9._:-]{1,256}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_outcome_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.photo_outcome_resolutions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.photo_outcome_resolutions TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_flow_photo_result(
  p_user_id uuid,
  p_reservation_id uuid,
  p_job_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
  v_job public.ai_jobs%ROWTYPE;
  v_settlement jsonb;
  v_action text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_res.result IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'pending', true, 'code', 'PHOTO_OUTCOME_UNKNOWN');
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.ai_jobs
      WHERE id = p_job_id AND user_id = p_user_id AND credit_reservation_id = p_reservation_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_OWNERSHIP_MISMATCH'); END IF;
  END IF;

  v_action := CASE WHEN v_res.result->>'success' = 'true' THEN 'commit' ELSE 'release' END;
  v_settlement := public.settle_flow_photo_credit_v2(
    p_user_id, p_reservation_id, v_action,
    CASE WHEN v_action = 'commit' THEN 'VALID_PHOTO_RESULT' ELSE 'CONFIRMED_PHOTO_FAILURE' END,
    p_now
  );
  IF COALESCE((v_settlement->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_settlement;
  END IF;

  UPDATE public.ai_jobs SET
    status = CASE WHEN v_action = 'commit' THEN 'succeeded' ELSE 'failed' END,
    error_code = CASE WHEN v_action = 'commit' THEN NULL ELSE COALESCE(v_res.result->>'errorCode', 'NOT_FOOD') END,
    completed_at = p_now
  WHERE user_id = p_user_id AND credit_reservation_id = p_reservation_id
    AND (status IN ('queued', 'running', 'processing') OR error_code = 'PHOTO_OUTCOME_UNKNOWN');

  RETURN jsonb_build_object('ok', true, 'pending', false, 'action', v_action,
    'status', v_settlement->>'status', 'replay', COALESCE((v_settlement->>'replay')::boolean, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_flow_photo_outcome_unknown(
  p_user_id uuid,
  p_reservation_id uuid,
  p_job_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
  v_job public.ai_jobs%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  SELECT * INTO v_job FROM public.ai_jobs
    WHERE id = p_job_id AND user_id = p_user_id AND credit_reservation_id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'JOB_OWNERSHIP_MISMATCH'); END IF;
  IF v_res.result IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'result', v_res.result, 'pending', false);
  END IF;
  IF v_res.status <> 'RESERVED' OR v_res.inference_claimed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_OUTCOME_NOT_AMBIGUOUS');
  END IF;

  UPDATE public.flow_credit_reservations
    SET outcome_unknown_at = COALESCE(outcome_unknown_at, p_now)
    WHERE id = p_reservation_id;
  UPDATE public.ai_jobs SET status = 'failed', error_code = 'PHOTO_OUTCOME_UNKNOWN', completed_at = p_now
    WHERE id = p_job_id AND user_id = p_user_id AND credit_reservation_id = p_reservation_id;
  RETURN jsonb_build_object('ok', true, 'pending', true, 'code', 'PHOTO_OUTCOME_UNKNOWN');
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_flow_photo_outcome_unknown(
  p_user_id uuid,
  p_reservation_id uuid,
  p_confirmed_failure boolean,
  p_evidence_reference text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
  v_settlement jsonb;
BEGIN
  IF p_confirmed_failure IS DISTINCT FROM true OR p_evidence_reference IS NULL
    OR p_evidence_reference !~ '^[A-Za-z0-9._:-]{1,256}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CONFIRMED_FAILURE_EVIDENCE_REQUIRED');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_res.status <> 'RESERVED' OR v_res.outcome_unknown_at IS NULL OR v_res.result IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_OUTCOME_NOT_RESOLVABLE');
  END IF;

  INSERT INTO public.photo_outcome_resolutions(reservation_id, user_id, resolution, evidence_reference)
  VALUES (p_reservation_id, p_user_id, 'CONFIRMED_FAILURE', p_evidence_reference);
  v_settlement := public.settle_flow_photo_credit(
    p_user_id, p_reservation_id, 'release', 'CONFIRMED_PROVIDER_FAILURE', p_now
  );
  IF COALESCE((v_settlement->>'ok')::boolean, false) IS NOT TRUE THEN
    DELETE FROM public.photo_outcome_resolutions WHERE reservation_id = p_reservation_id;
    RETURN v_settlement;
  END IF;
  UPDATE public.ai_jobs SET status = 'failed', error_code = 'PHOTO_CONFIRMED_FAILURE', completed_at = p_now
    WHERE user_id = p_user_id AND credit_reservation_id = p_reservation_id
      AND error_code = 'PHOTO_OUTCOME_UNKNOWN';
  RETURN v_settlement || jsonb_build_object('evidenceReference', p_evidence_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_flow_photo_result(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_flow_photo_outcome_unknown(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_flow_photo_result(uuid, uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_flow_photo_outcome_unknown(uuid, uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_flow_photo_credit(
  p_user_id uuid,
  p_logical_analysis_id text,
  p_entitlement text DEFAULT 'free',
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 3,
  p_premium_fair_use integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date := (p_now AT TIME ZONE 'UTC')::date;
  v_row public.credite_ai%ROWTYPE;
  v_existing public.flow_credit_reservations%ROWTYPE;
  v_reservation public.flow_credit_reservations%ROWTYPE;
  v_result_row record;
  v_source text;
BEGIN
  IF p_logical_analysis_id IS NULL OR length(p_logical_analysis_id) NOT BETWEEN 1 AND 256 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LOGICAL_ANALYSIS_ID');
  END IF;
  IF p_entitlement NOT IN ('free', 'premium', 'full_access') THEN p_entitlement := 'free'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_existing FROM public.flow_credit_reservations
    WHERE user_id = p_user_id AND logical_analysis_id = p_logical_analysis_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reservationId', v_existing.id,
      'source', v_existing.source, 'status', v_existing.status,
      'serverDay', v_existing.server_day, 'replay', true);
  END IF;

  FOR v_result_row IN
    SELECT reservation.id, job.id AS job_id
    FROM public.flow_credit_reservations AS reservation
    LEFT JOIN public.ai_jobs AS job ON job.user_id = reservation.user_id
      AND job.credit_reservation_id = reservation.id
    WHERE reservation.user_id = p_user_id AND reservation.status = 'RESERVED'
      AND reservation.result IS NOT NULL
    FOR UPDATE OF reservation
  LOOP
    PERFORM public.reconcile_flow_photo_result(p_user_id, v_result_row.id, v_result_row.job_id, p_now);
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.flow_credit_reservations
             WHERE user_id = p_user_id AND status = 'RESERVED' AND outcome_unknown_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_IN_PROGRESS');
  END IF;

  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;

  IF v_row.daily_day IS DISTINCT FROM v_day THEN
    v_row.daily_day := v_day; v_row.daily_used := 0;
  END IF;
  IF v_row.premium_day IS DISTINCT FROM v_day THEN
    v_row.premium_day := v_day; v_row.premium_used := 0;
  END IF;

  IF p_entitlement = 'full_access' THEN
    v_source := 'FULL_ACCESS';
  ELSIF p_entitlement = 'premium' THEN
    IF v_row.premium_used >= p_premium_fair_use THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PREMIUM_FAIR_USE_REACHED');
    END IF;
    v_row.premium_used := v_row.premium_used + 1;
    v_source := 'PREMIUM';
  ELSIF v_row.daily_used < p_daily_limit THEN
    v_row.daily_used := v_row.daily_used + 1;
    v_source := 'DAILY';
  ELSIF v_row.rewarded_balance > 0 THEN
    v_row.rewarded_balance := v_row.rewarded_balance - 1;
    v_source := 'REWARDED';
  ELSIF v_row.purchased_balance > 0 THEN
    v_row.purchased_balance := v_row.purchased_balance - 1;
    v_source := 'PURCHASED';
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'FLOW_CREDITS_EXHAUSTED');
  END IF;

  UPDATE public.credite_ai SET
    daily_day = v_row.daily_day, daily_used = v_row.daily_used,
    rewarded_balance = v_row.rewarded_balance,
    purchased_balance = v_row.purchased_balance,
    premium_day = v_row.premium_day, premium_used = v_row.premium_used,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.flow_credit_reservations(user_id, logical_analysis_id, source, server_day)
  VALUES (p_user_id, p_logical_analysis_id, v_source, v_day)
  RETURNING * INTO v_reservation;

  INSERT INTO public.credite_tranzactii(user_id, event_id, event_type, credite_delta, metadata)
  VALUES (p_user_id, 'photo-reserve:' || v_reservation.id, 'PHOTO_RESERVE',
    CASE WHEN v_source IN ('REWARDED', 'PURCHASED') THEN -1 ELSE 0 END,
    jsonb_build_object('reservation_id', v_reservation.id, 'source', v_source));

  RETURN jsonb_build_object('ok', true, 'reservationId', v_reservation.id,
    'source', v_source, 'status', 'RESERVED', 'serverDay', v_day, 'replay', false);
END;
$$;

-- Atomically map a verified one-use token/request binding to one durable AdMob intent.
CREATE TABLE IF NOT EXISTS public.flow_reward_intent_secrets (
  intent_id uuid PRIMARY KEY REFERENCES public.flow_reward_intents(id) ON DELETE CASCADE,
  play_integrity_token_hash text NOT NULL UNIQUE CHECK (play_integrity_token_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[A-Za-z0-9_-]{1,128}$'),
  custom_data text NOT NULL CHECK (length(custom_data) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flow_reward_intent_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.flow_reward_intent_secrets FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_flow_reward_intent_by_integrity_token(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_row record;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT intent.id, intent.user_id, secret.request_hash, secret.custom_data,
      intent.expires_at, intent.status
    INTO v_row
    FROM public.flow_reward_intent_secrets AS secret
    JOIN public.flow_reward_intents AS intent ON intent.id = secret.intent_id
    WHERE secret.play_integrity_token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', v_row.id, 'userId', v_row.user_id,
    'requestHash', v_row.request_hash, 'customData', v_row.custom_data,
    'expiresAt', v_row.expires_at, 'status', v_row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_flow_reward_intent_idempotent(
  p_id uuid,
  p_user_id uuid,
  p_custom_data text,
  p_custom_data_hash text,
  p_token_hash text,
  p_request_hash text,
  p_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_intent public.flow_reward_intents%ROWTYPE;
  v_secret public.flow_reward_intent_secrets%ROWTYPE;
  v_existing record;
BEGIN
  IF p_id IS NULL OR p_user_id IS NULL
    OR p_custom_data IS NULL OR length(p_custom_data) NOT BETWEEN 1 AND 256
    OR p_custom_data_hash IS NULL OR p_custom_data_hash !~ '^[a-f0-9]{64}$'
    OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
    OR p_request_hash IS NULL OR p_request_hash !~ '^[A-Za-z0-9_-]{1,128}$'
    OR p_expires_at IS NULL OR p_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REWARDED_INTENT');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_token_hash, 51973));
  SELECT intent.id, intent.user_id, intent.expires_at, intent.status,
      secret.request_hash, secret.custom_data
    INTO v_existing
    FROM public.flow_reward_intents AS intent
    JOIN public.flow_reward_intent_secrets AS secret ON secret.intent_id = intent.id
    WHERE secret.play_integrity_token_hash = p_token_hash FOR UPDATE OF intent, secret;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id OR v_existing.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'REWARDED_TOKEN_REPLAY');
    END IF;
    RETURN jsonb_build_object('ok', true, 'id', v_existing.id, 'userId', v_existing.user_id,
      'requestHash', v_existing.request_hash, 'customData', v_existing.custom_data,
      'expiresAt', v_existing.expires_at, 'status', v_existing.status, 'replay', true);
  END IF;

  INSERT INTO public.flow_reward_intents(
    id, user_id, custom_data_hash, expires_at
  ) VALUES (
    p_id, p_user_id, p_custom_data_hash, p_expires_at
  ) RETURNING * INTO v_intent;
  INSERT INTO public.flow_reward_intent_secrets(intent_id, play_integrity_token_hash, request_hash, custom_data)
  VALUES (p_id, p_token_hash, p_request_hash, p_custom_data)
  RETURNING * INTO v_secret;
  RETURN jsonb_build_object('ok', true, 'id', v_intent.id, 'userId', v_intent.user_id,
    'requestHash', v_secret.request_hash, 'customData', v_secret.custom_data,
    'expiresAt', v_intent.expires_at, 'status', v_intent.status, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_flow_reward_intent_idempotent(uuid, uuid, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flow_reward_intent_idempotent(uuid, uuid, text, text, text, text, timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_flow_reward_intent_by_integrity_token(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_flow_reward_intent_by_integrity_token(text) TO service_role;

COMMENT ON TABLE public.flow_reward_intent_secrets IS
  'Server-only replay material for verified AdMob intents; no Data API client grants.';
