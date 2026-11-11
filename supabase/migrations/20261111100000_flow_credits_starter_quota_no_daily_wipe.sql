-- Migrare: starter quota pentru Flow Credits fara resetare zilnica a creditelor consumate
-- Ziua calendaristica reseteaza exclusiv limita de reclame vizionate (rewarded_grants_today) si fair-use premium

CREATE OR REPLACE FUNCTION public.flow_credits_balance(
  p_user_id uuid,
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 3,
  p_reward_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date := (p_now AT TIME ZONE 'UTC')::date;
  v_row public.credite_ai%ROWTYPE;
  v_daily_remaining integer;
BEGIN
  IF p_daily_limit < 0 OR p_reward_limit < 0 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;
  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;

  -- Actualizăm doar contoarele zilnice resetabile (reclame și fair-use premium).
  -- daily_used reprezintă cota consumată din creditele starter gratuite și NU se resetează zilnic.
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
  IF EXISTS (SELECT 1 FROM public.flow_credit_reservations
             WHERE user_id = p_user_id AND status = 'RESERVED') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHOTO_IN_PROGRESS');
  END IF;

  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;

  IF v_row.daily_day IS NULL THEN
    v_row.daily_day := v_day;
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
  ELSIF coalesce(v_row.daily_used, 0) < p_daily_limit THEN
    v_row.daily_used := coalesce(v_row.daily_used, 0) + 1;
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

CREATE OR REPLACE FUNCTION public.settle_flow_photo_credit(
  p_user_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date := (p_now AT TIME ZONE 'UTC')::date;
  v_res public.flow_credit_reservations%ROWTYPE;
  v_event_type text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  SELECT * INTO v_res FROM public.flow_credit_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'RESERVATION_NOT_FOUND'); END IF;
  IF v_res.status <> 'RESERVED' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_res.status, 'source', v_res.source, 'replay', true);
  END IF;
  IF p_action NOT IN ('commit', 'release') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SETTLEMENT_ACTION');
  END IF;

  IF p_action = 'release' THEN
    INSERT INTO public.credite_ai(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.credite_ai SET
      daily_used = CASE WHEN v_res.source = 'DAILY'
                        THEN greatest(0, daily_used - 1) ELSE daily_used END,
      rewarded_balance = rewarded_balance + CASE WHEN v_res.source = 'REWARDED' THEN 1 ELSE 0 END,
      purchased_balance = purchased_balance + CASE WHEN v_res.source = 'PURCHASED' THEN 1 ELSE 0 END,
      premium_used = CASE WHEN v_res.source = 'PREMIUM'
                          THEN greatest(0, premium_used - 1) ELSE premium_used END,
      updated_at = now()
    WHERE user_id = p_user_id;
    UPDATE public.flow_credit_reservations SET status = 'RELEASED', settled_at = p_now,
      release_reason = left(coalesce(p_reason, 'SYSTEM_FAILURE'), 64)
      WHERE id = p_reservation_id;
    v_event_type := 'PHOTO_RELEASE';
  ELSE
    UPDATE public.flow_credit_reservations SET status = 'COMMITTED', settled_at = p_now
      WHERE id = p_reservation_id;
    v_event_type := 'PHOTO_COMMIT';
  END IF;

  INSERT INTO public.credite_tranzactii(user_id, event_id, event_type, credite_delta, metadata)
  VALUES (p_user_id, lower(p_action) || ':' || p_reservation_id, v_event_type,
    CASE WHEN p_action = 'release' AND v_res.source IN ('REWARDED', 'PURCHASED') THEN 1 ELSE 0 END,
    jsonb_build_object('reservation_id', p_reservation_id, 'source', v_res.source))
  ON CONFLICT (event_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'status',
    CASE p_action WHEN 'commit' THEN 'COMMITTED' ELSE 'RELEASED' END,
    'source', v_res.source, 'replay', false);
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
  v_error_code text;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_flow_photo_credit(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_flow_photo_credit(uuid, uuid, text, text, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.settle_flow_photo_credit_v2(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_flow_photo_credit_v2(uuid, uuid, text, text, timestamptz) TO service_role;

