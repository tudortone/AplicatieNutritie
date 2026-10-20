ALTER TABLE public.flow_credit_reservations
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS inference_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS result jsonb;

CREATE INDEX IF NOT EXISTS ai_jobs_credit_reservation_id_idx
  ON public.ai_jobs (user_id, credit_reservation_id)
  WHERE credit_reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_flow_photo_credit_v2(
  p_user_id uuid,
  p_logical_analysis_id text,
  p_request_fingerprint text,
  p_entitlement text DEFAULT 'free',
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 3,
  p_premium_fair_use integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reservation jsonb;
  v_row public.flow_credit_reservations%ROWTYPE;
BEGIN
  IF p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_FINGERPRINT');
  END IF;

  v_reservation := public.reserve_flow_photo_credit(
    p_user_id, p_logical_analysis_id, p_entitlement, p_now, p_daily_limit, p_premium_fair_use
  );
  IF coalesce((v_reservation->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_reservation;
  END IF;

  SELECT * INTO v_row FROM public.flow_credit_reservations
    WHERE id = (v_reservation->>'reservationId')::uuid AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;

  IF v_row.request_fingerprint IS NULL THEN
    IF v_reservation->>'replay' = 'true' AND v_row.status <> 'RELEASED' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_REQUIRES_RECONCILIATION',
        'reservationId', v_row.id, 'status', v_row.status);
    END IF;
    UPDATE public.flow_credit_reservations SET request_fingerprint = p_request_fingerprint
      WHERE id = v_row.id;
    v_row.request_fingerprint := p_request_fingerprint;
  ELSIF v_row.request_fingerprint <> p_request_fingerprint THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LOGICAL_ID_IMAGE_MISMATCH');
  END IF;

  RETURN v_reservation || jsonb_build_object(
    'status', v_row.status,
    'result', v_row.result,
    'inferenceClaimed', v_row.inference_claimed_at IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_flow_photo_inference(
  p_user_id uuid,
  p_reservation_id uuid,
  p_request_fingerprint text,
  p_job_id uuid DEFAULT NULL,
  p_logical_analysis_id text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_image_file_id text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
  v_job public.ai_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_res.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LOGICAL_ID_IMAGE_MISMATCH');
  END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.ai_jobs WHERE id = p_job_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR v_job.credit_reservation_id IS DISTINCT FROM p_reservation_id
      OR v_job.logical_analysis_id IS DISTINCT FROM p_logical_analysis_id
      OR v_job.image_url IS DISTINCT FROM p_image_url
      OR (p_image_file_id IS NOT NULL AND v_job.image_file_id IS DISTINCT FROM p_image_file_id) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'JOB_OWNERSHIP_MISMATCH');
    END IF;
  END IF;

  IF v_res.status <> 'RESERVED' OR v_res.result IS NOT NULL
    OR v_res.inference_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'acquired', false, 'status', v_res.status,
      'result', v_res.result, 'inferenceClaimed', v_res.inference_claimed_at IS NOT NULL, 'replay', true);
  END IF;

  IF p_job_id IS NOT NULL THEN
    IF v_job.status <> 'queued' THEN
      RETURN jsonb_build_object('ok', true, 'acquired', false, 'status', v_job.status,
        'result', v_res.result, 'inferenceClaimed', false, 'replay', true);
    END IF;
    UPDATE public.ai_jobs SET status = 'running', started_at = p_now, error_code = NULL
      WHERE id = p_job_id AND user_id = p_user_id AND status = 'queued';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'acquired', false, 'status', 'running',
        'result', v_res.result, 'inferenceClaimed', false, 'replay', true);
    END IF;
  END IF;

  UPDATE public.flow_credit_reservations SET inference_claimed_at = p_now WHERE id = p_reservation_id;
  RETURN jsonb_build_object('ok', true, 'acquired', true, 'status', 'RESERVED', 'replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_flow_photo_result(
  p_user_id uuid,
  p_reservation_id uuid,
  p_request_fingerprint text,
  p_result jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_result->'success') IS DISTINCT FROM 'boolean' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PHOTO_RESULT');
  END IF;
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_res.request_fingerprint IS DISTINCT FROM p_request_fingerprint
    OR v_res.inference_claimed_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_INFERENCE_CLAIM_REQUIRED');
  END IF;
  IF v_res.result IS NOT NULL THEN
    IF v_res.result <> p_result THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_RESULT_ALREADY_RECORDED');
    END IF;
    RETURN jsonb_build_object('ok', true, 'result', v_res.result, 'replay', true);
  END IF;
  IF v_res.status <> 'RESERVED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_RESERVATION_NOT_ACTIVE');
  END IF;
  UPDATE public.flow_credit_reservations SET result = p_result WHERE id = p_reservation_id;
  UPDATE public.ai_jobs SET result = p_result
    WHERE user_id = p_user_id AND credit_reservation_id = p_reservation_id
      AND status IN ('queued', 'running', 'processing');
  RETURN jsonb_build_object('ok', true, 'result', p_result, 'replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_flow_photo_credit_v2(
  p_user_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
  v_settlement jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF p_action NOT IN ('commit', 'release') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SETTLEMENT_ACTION');
  END IF;
  IF v_res.status <> 'RESERVED' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_res.status, 'source', v_res.source, 'replay', true);
  END IF;
  IF p_action = 'commit' AND (v_res.result IS NULL OR v_res.result->>'success' IS DISTINCT FROM 'true') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALID_PHOTO_RESULT_REQUIRED');
  END IF;
  IF p_action = 'release' AND v_res.inference_claimed_at IS NOT NULL
    AND coalesce(v_res.result->>'success', 'true') <> 'false' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_OUTCOME_UNKNOWN');
  END IF;
  v_settlement := public.settle_flow_photo_credit(p_user_id, p_reservation_id, p_action, p_reason, p_now);
  IF coalesce((v_settlement->>'ok')::boolean, false) IS TRUE THEN
    UPDATE public.ai_jobs SET
      status = CASE WHEN p_action = 'commit' THEN 'succeeded' ELSE 'failed' END,
      error_code = CASE WHEN p_action = 'commit' THEN NULL ELSE 'PHOTO_ANALYSIS_FAILED' END,
      completed_at = p_now
      WHERE user_id = p_user_id AND credit_reservation_id = p_reservation_id
        AND status IN ('queued', 'running', 'processing');
  END IF;
  RETURN v_settlement;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_flow_photo_inference(uuid, uuid, text, uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_flow_photo_result(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_flow_photo_credit_v2(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_flow_photo_inference(uuid, uuid, text, uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_flow_photo_result(uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_flow_photo_credit_v2(uuid, uuid, text, text, timestamptz) TO service_role;
