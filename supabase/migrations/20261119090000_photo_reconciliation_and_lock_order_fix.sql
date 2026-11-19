-- P0-04, P0-05, P1-05:
-- 1) Remove redundant pre-check in reserve_flow_photo_credit_v2 that blocked
--    logical_analysis_id replays and durable result reconciliation before
--    reserve_flow_photo_credit could run under the user advisory lock.
-- 2) Restore pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107)) as the
--    first statement in settle_flow_photo_credit_v2 (with SET search_path = pg_catalog, public)
--    to eliminate the AB-BA deadlock (40P01) with reserve/reconcile RPCs.
-- 3) Invoke reconcile_stale_flow_photo_reservations(p_user_id, p_now) inside
--    flow_credits_balance so a stale abandoned reservation on the user's last credit
--    is released automatically on balance read.
-- 4) Add bounded global batch RPC reconcile_all_stale_flow_photo_reservations for
--    the periodic backend reconciliation worker.

CREATE OR REPLACE FUNCTION public.settle_flow_photo_credit_v2(
  p_user_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_res public.flow_credit_reservations%ROWTYPE;
  v_settlement jsonb;
  v_error_code text;
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
    IF p_action = 'commit' THEN
      v_error_code := NULL;
    ELSIF p_reason IS NOT NULL AND p_reason <> '' AND p_reason <> 'CONFIRMED_PHOTO_FAILURE' THEN
      v_error_code := p_reason;
    ELSIF v_res.result IS NOT NULL AND v_res.result->>'errorCode' IS NOT NULL THEN
      v_error_code := v_res.result->>'errorCode';
    ELSE
      v_error_code := 'PHOTO_ANALYSIS_FAILED';
    END IF;

    UPDATE public.ai_jobs SET
      status = CASE WHEN p_action = 'commit' THEN 'succeeded' ELSE 'failed' END,
      error_code = v_error_code,
      completed_at = p_now
      WHERE user_id = p_user_id AND credit_reservation_id = p_reservation_id
        AND status IN ('queued', 'running', 'processing');
  END IF;
  RETURN v_settlement;
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

  -- Delegate directly to reserve_flow_photo_credit under the per-user advisory lock:
  -- 1) exact replay for p_logical_analysis_id,
  -- 2) reconcile any RESERVED row with a durable result,
  -- 3) reject PHOTO_IN_PROGRESS only if another live RESERVED (outcome_unknown_at IS NULL) row remains.
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

CREATE OR REPLACE FUNCTION public.flow_credits_balance(
  p_user_id uuid,
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 3,
  p_reward_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_day date := (p_now AT TIME ZONE 'UTC')::date;
  v_row public.credite_ai%ROWTYPE;
  v_daily_remaining integer;
BEGIN
  IF p_daily_limit < 0 OR p_reward_limit < 0 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;

  PERFORM public.reconcile_stale_flow_photo_reservations(p_user_id, p_now);

  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;

  IF v_row.daily_day IS NULL THEN
    UPDATE public.credite_ai SET daily_day = v_day WHERE user_id = p_user_id;
    v_row.daily_day := v_day;
  END IF;
  IF v_row.reward_day IS DISTINCT FROM v_day THEN
    UPDATE public.credite_ai SET reward_day = v_day, rewarded_grants_today = 0 WHERE user_id = p_user_id;
    v_row.reward_day := v_day; v_row.rewarded_grants_today := 0;
  END IF;
  IF v_row.premium_day IS DISTINCT FROM v_day THEN
    UPDATE public.credite_ai SET premium_day = v_day, premium_used = 0 WHERE user_id = p_user_id;
    v_row.premium_day := v_day; v_row.premium_used := 0;
  END IF;

  v_daily_remaining := greatest(0, p_daily_limit - coalesce(v_row.daily_used, 0));
  RETURN jsonb_build_object(
    'dailyRemaining', v_daily_remaining,
    'rewarded', v_row.rewarded_balance,
    'purchased', v_row.purchased_balance,
    'total', v_daily_remaining + v_row.rewarded_balance + v_row.purchased_balance,
    'rewardedGrantsRemaining', greatest(0, p_reward_limit - v_row.rewarded_grants_today),
    'serverDay', v_day,
    'nextResetAt', ((v_day + 1)::timestamp AT TIME ZONE 'UTC')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_all_stale_flow_photo_reservations(
  p_limit integer DEFAULT 100,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_user_id uuid;
  v_res jsonb;
  v_users integer := 0;
  v_released integer := 0;
  v_marked_unknown integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_now IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RECONCILIATION_INPUT');
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT r.user_id FROM public.flow_credit_reservations AS r
    WHERE r.status = 'RESERVED' AND r.result IS NULL
      AND ((r.inference_claimed_at IS NULL AND r.created_at <= p_now - interval '15 minutes')
        OR (r.inference_claimed_at < p_now - interval '2 minutes' AND r.outcome_unknown_at IS NULL))
    ORDER BY r.user_id
    LIMIT p_limit
  LOOP
    v_res := public.reconcile_stale_flow_photo_reservations(v_user_id, p_now);
    v_users := v_users + 1;
    v_released := v_released + coalesce((v_res->>'releasedBeforeInference')::integer, 0);
    v_marked_unknown := v_marked_unknown + coalesce((v_res->>'markedUnknown')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'usersChecked', v_users,
    'releasedBeforeInference', v_released,
    'markedUnknown', v_marked_unknown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_flow_photo_credit_v2(uuid, uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_all_stale_flow_photo_reservations(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.settle_flow_photo_credit_v2(uuid, uuid, text, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_all_stale_flow_photo_reservations(integer, timestamptz)
  TO service_role;
