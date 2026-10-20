-- A row without an inference claim cannot have reached Gemini; a claimed row
-- without a result must stay held and become visible for evidence-based review.
CREATE OR REPLACE FUNCTION public.reconcile_stale_flow_photo_reservations(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_reservation record;
  v_settlement jsonb;
  v_released integer := 0;
  v_marked_unknown integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_now IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RECONCILIATION_INPUT');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));

  FOR v_reservation IN
    SELECT id FROM public.flow_credit_reservations
    WHERE user_id = p_user_id AND status = 'RESERVED' AND result IS NULL
      AND inference_claimed_at IS NULL
      AND created_at <= p_now - interval '15 minutes'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_settlement := public.settle_flow_photo_credit_v2(
      p_user_id, v_reservation.id, 'release', 'PHOTO_ABANDONED_BEFORE_INFERENCE', p_now
    );
    IF coalesce((v_settlement->>'ok')::boolean, false) IS TRUE THEN
      UPDATE public.ai_jobs SET error_code = 'PHOTO_ABANDONED_BEFORE_INFERENCE'
      WHERE user_id = p_user_id AND credit_reservation_id = v_reservation.id
        AND status = 'failed' AND error_code = 'PHOTO_ANALYSIS_FAILED';
      v_released := v_released + 1;
    END IF;
  END LOOP;

  FOR v_reservation IN
    SELECT id FROM public.flow_credit_reservations
    WHERE user_id = p_user_id AND status = 'RESERVED' AND result IS NULL
      AND inference_claimed_at <= p_now - interval '10 minutes'
      AND outcome_unknown_at IS NULL
    ORDER BY inference_claimed_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.flow_credit_reservations SET outcome_unknown_at = p_now
    WHERE id = v_reservation.id AND user_id = p_user_id;
    UPDATE public.ai_jobs SET status = 'failed', error_code = 'PHOTO_OUTCOME_UNKNOWN', completed_at = p_now
    WHERE user_id = p_user_id AND credit_reservation_id = v_reservation.id
      AND status IN ('queued', 'running', 'processing');
    v_marked_unknown := v_marked_unknown + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'releasedBeforeInference', v_released,
    'markedUnknown', v_marked_unknown);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_flow_photo_outcome_reconciliation_queue(
  p_limit integer DEFAULT 50,
  p_now timestamptz DEFAULT now()
) RETURNS TABLE (
  reservation_id uuid,
  user_id uuid,
  logical_analysis_id text,
  outcome_unknown_at timestamptz,
  inference_claimed_at timestamptz,
  job_id uuid,
  trigger_run_id text,
  job_status text,
  error_code text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_now IS NULL THEN
    RAISE EXCEPTION 'Invalid Photo reconciliation queue parameters';
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT reservation.user_id FROM public.flow_credit_reservations AS reservation
    WHERE reservation.status = 'RESERVED' AND reservation.result IS NULL
      AND ((reservation.inference_claimed_at IS NULL
        AND reservation.created_at <= p_now - interval '15 minutes')
        OR (reservation.inference_claimed_at <= p_now - interval '10 minutes'
          AND reservation.outcome_unknown_at IS NULL))
    ORDER BY reservation.user_id
    LIMIT p_limit
  LOOP
    PERFORM public.reconcile_stale_flow_photo_reservations(v_user_id, p_now);
  END LOOP;

  RETURN QUERY
  SELECT reservation.id, reservation.user_id, reservation.logical_analysis_id,
    reservation.outcome_unknown_at, reservation.inference_claimed_at,
    job.id, job.trigger_run_id, job.status, job.error_code
  FROM public.flow_credit_reservations AS reservation
  LEFT JOIN LATERAL (
    SELECT candidate.id, candidate.trigger_run_id, candidate.status, candidate.error_code
    FROM public.ai_jobs AS candidate
    WHERE candidate.user_id = reservation.user_id
      AND candidate.credit_reservation_id = reservation.id
    ORDER BY candidate.created_at DESC
    LIMIT 1
  ) AS job ON true
  WHERE reservation.status = 'RESERVED' AND reservation.outcome_unknown_at IS NOT NULL
  ORDER BY reservation.outcome_unknown_at, reservation.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_flow_photo_credit_v2(
  p_user_id uuid,
  p_logical_analysis_id text,
  p_request_fingerprint text,
  p_entitlement text DEFAULT 'free',
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 3,
  p_premium_fair_use integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_reservation jsonb;
  v_row public.flow_credit_reservations%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_fingerprint IS NULL
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_FINGERPRINT');
  END IF;

  PERFORM public.reconcile_stale_flow_photo_reservations(p_user_id, p_now);
  IF EXISTS (
    SELECT 1 FROM public.flow_credit_reservations
    WHERE user_id = p_user_id AND status = 'RESERVED' AND outcome_unknown_at IS NOT NULL
      AND inference_claimed_at >= p_now - interval '10 minutes'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_IN_PROGRESS');
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

  RETURN v_reservation || jsonb_build_object('status', v_row.status,
    'result', v_row.result, 'inferenceClaimed', v_row.inference_claimed_at IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stale_flow_photo_reservations(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_flow_photo_outcome_reconciliation_queue(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_flow_photo_reservations(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_flow_photo_outcome_reconciliation_queue(integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.reconcile_stale_flow_photo_reservations(uuid, timestamptz) IS
  'Releases only stale reservations that never claimed inference; claimed/no-result reservations stay held and become PHOTO_OUTCOME_UNKNOWN.';
COMMENT ON FUNCTION public.list_flow_photo_outcome_reconciliation_queue(integer, timestamptz) IS
  'Bounded service-role operator queue; intentionally omits image URLs and never releases ambiguous reservations.';

ALTER TABLE public.photo_outcome_resolutions
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

REVOKE ALL ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_flow_photo_outcome_unknown(
  p_user_id uuid,
  p_reservation_id uuid,
  p_confirmed_failure boolean,
  p_evidence_reference text,
  p_resolved_by uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_reservation public.flow_credit_reservations%ROWTYPE;
  v_settlement jsonb;
BEGIN
  IF p_confirmed_failure IS DISTINCT FROM true OR p_evidence_reference IS NULL
    OR p_evidence_reference !~ '^[A-Za-z0-9._:-]{1,256}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CONFIRMED_FAILURE_EVIDENCE_REQUIRED');
  END IF;
  IF p_resolved_by IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users AS operator
    WHERE operator.id = p_resolved_by AND operator.raw_app_meta_data->>'rol' = 'admin'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_REQUIRED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_reservation FROM public.flow_credit_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_reservation.status = 'RELEASED' AND EXISTS (
    SELECT 1 FROM public.photo_outcome_resolutions
    WHERE reservation_id = p_reservation_id AND user_id = p_user_id
      AND resolution = 'CONFIRMED_FAILURE'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'RELEASED', 'replay', true);
  END IF;
  IF v_reservation.status <> 'RESERVED' OR v_reservation.outcome_unknown_at IS NULL
    OR v_reservation.result IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_OUTCOME_NOT_RESOLVABLE');
  END IF;

  INSERT INTO public.photo_outcome_resolutions(
    reservation_id, user_id, resolution, evidence_reference, resolved_by
  ) VALUES (
    p_reservation_id, p_user_id, 'CONFIRMED_FAILURE', p_evidence_reference, p_resolved_by
  );
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

REVOKE ALL ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_flow_photo_outcome_unknown(uuid, uuid, boolean, text, uuid, timestamptz)
  TO service_role;
