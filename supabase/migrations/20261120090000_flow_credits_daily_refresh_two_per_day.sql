-- Restaurează acordarea/completarea zilnică la 2 credite Flow gratuite pe zi,
-- respectând fusul orar IANA al utilizatorului, fără a șterge creditele
-- bonus din reclame (rewarded_balance) sau pachetele cumpărate (purchased_balance).

ALTER TABLE public.credite_ai
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

DROP FUNCTION IF EXISTS public.flow_credits_balance(uuid, timestamptz, integer, integer);
DROP FUNCTION IF EXISTS public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer);
DROP FUNCTION IF EXISTS public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer);

CREATE OR REPLACE FUNCTION public.flow_credits_balance(
  p_user_id uuid,
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 2,
  p_reward_limit integer DEFAULT 5,
  p_timezone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tz text;
  v_tz_candidate text;
  v_day date;
  v_row public.credite_ai%ROWTYPE;
  v_prev_tz text;
  v_prev_daily_day date;
  v_prev_reward_day date;
  v_prev_premium_day date;
  v_daily_remaining integer;
BEGIN
  IF p_daily_limit < 0 OR p_reward_limit < 0 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;

  PERFORM public.reconcile_stale_flow_photo_reservations(p_user_id, p_now);

  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;

  v_prev_tz := v_row.timezone;
  v_prev_daily_day := v_row.daily_day;
  v_prev_reward_day := v_row.reward_day;
  v_prev_premium_day := v_row.premium_day;

  IF p_timezone IS NOT NULL THEN
    v_tz_candidate := trim(p_timezone);
    IF length(v_tz_candidate) BETWEEN 1 AND 64 THEN
      BEGIN
        PERFORM p_now AT TIME ZONE v_tz_candidate;
        v_tz := v_tz_candidate;
      EXCEPTION WHEN invalid_parameter_value THEN
        v_tz := NULL;
      END;
    END IF;
  END IF;

  IF v_tz IS NULL THEN
    v_tz_candidate := coalesce(nullif(trim(v_row.timezone), ''), 'UTC');
    BEGIN
      PERFORM p_now AT TIME ZONE v_tz_candidate;
      v_tz := v_tz_candidate;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'UTC';
    END;
  END IF;

  v_day := (p_now AT TIME ZONE v_tz)::date;

  -- Rollover monotonic înainte pe ziua locală a utilizatorului:
  -- previne resetarea abuzivă prin mutarea fusului orar înapoi,
  -- și păstrează integral rewarded_balance și purchased_balance.
  IF v_row.daily_day IS NULL OR v_day > v_row.daily_day THEN
    v_row.daily_day := v_day;
    v_row.daily_used := 0;
  END IF;
  IF v_row.reward_day IS NULL OR v_day > v_row.reward_day THEN
    v_row.reward_day := v_day;
    v_row.rewarded_grants_today := 0;
  END IF;
  IF v_row.premium_day IS NULL OR v_day > v_row.premium_day THEN
    v_row.premium_day := v_day;
    v_row.premium_used := 0;
  END IF;

  IF v_prev_tz IS DISTINCT FROM v_tz
     OR v_prev_daily_day IS DISTINCT FROM v_row.daily_day
     OR v_prev_reward_day IS DISTINCT FROM v_row.reward_day
     OR v_prev_premium_day IS DISTINCT FROM v_row.premium_day THEN
    UPDATE public.credite_ai SET
      timezone = v_tz,
      daily_day = v_row.daily_day,
      daily_used = v_row.daily_used,
      reward_day = v_row.reward_day,
      rewarded_grants_today = v_row.rewarded_grants_today,
      premium_day = v_row.premium_day,
      premium_used = v_row.premium_used,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  v_daily_remaining := greatest(0, p_daily_limit - coalesce(v_row.daily_used, 0));
  RETURN jsonb_build_object(
    'dailyRemaining', v_daily_remaining,
    'rewarded', v_row.rewarded_balance,
    'purchased', v_row.purchased_balance,
    'total', v_daily_remaining + v_row.rewarded_balance + v_row.purchased_balance,
    'rewardedGrantsRemaining', greatest(0, p_reward_limit - v_row.rewarded_grants_today),
    'serverDay', v_day,
    'nextResetAt', ((v_day + 1)::timestamp AT TIME ZONE v_tz)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_flow_photo_credit(
  p_user_id uuid,
  p_logical_analysis_id text,
  p_entitlement text DEFAULT 'free',
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 2,
  p_premium_fair_use integer DEFAULT 50,
  p_timezone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tz text;
  v_tz_candidate text;
  v_day date;
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

  IF p_timezone IS NOT NULL THEN
    v_tz_candidate := trim(p_timezone);
    IF length(v_tz_candidate) BETWEEN 1 AND 64 THEN
      BEGIN
        PERFORM p_now AT TIME ZONE v_tz_candidate;
        v_tz := v_tz_candidate;
      EXCEPTION WHEN invalid_parameter_value THEN
        v_tz := NULL;
      END;
    END IF;
  END IF;

  IF v_tz IS NULL THEN
    v_tz_candidate := coalesce(nullif(trim(v_row.timezone), ''), 'UTC');
    BEGIN
      PERFORM p_now AT TIME ZONE v_tz_candidate;
      v_tz := v_tz_candidate;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'UTC';
    END;
  END IF;

  v_day := (p_now AT TIME ZONE v_tz)::date;

  IF v_row.daily_day IS NULL OR v_day > v_row.daily_day THEN
    v_row.daily_day := v_day;
    v_row.daily_used := 0;
  END IF;
  IF v_row.reward_day IS NULL OR v_day > v_row.reward_day THEN
    v_row.reward_day := v_day;
    v_row.rewarded_grants_today := 0;
  END IF;
  IF v_row.premium_day IS NULL OR v_day > v_row.premium_day THEN
    v_row.premium_day := v_day;
    v_row.premium_used := 0;
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
    timezone = v_tz,
    daily_day = v_row.daily_day, daily_used = v_row.daily_used,
    reward_day = v_row.reward_day, rewarded_grants_today = v_row.rewarded_grants_today,
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

CREATE OR REPLACE FUNCTION public.reserve_flow_photo_credit_v2(
  p_user_id uuid,
  p_logical_analysis_id text,
  p_request_fingerprint text,
  p_entitlement text DEFAULT 'free',
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 2,
  p_premium_fair_use integer DEFAULT 50,
  p_timezone text DEFAULT NULL
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

  v_reservation := public.reserve_flow_photo_credit(
    p_user_id, p_logical_analysis_id, p_entitlement, p_now, p_daily_limit, p_premium_fair_use, p_timezone
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

CREATE OR REPLACE FUNCTION public.settle_flow_photo_credit(
  p_user_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
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
      daily_used = CASE WHEN v_res.source = 'DAILY' AND daily_day = v_res.server_day
                        THEN greatest(0, daily_used - 1) ELSE daily_used END,
      rewarded_balance = rewarded_balance + CASE WHEN v_res.source = 'REWARDED' THEN 1 ELSE 0 END,
      purchased_balance = purchased_balance + CASE WHEN v_res.source = 'PURCHASED' THEN 1 ELSE 0 END,
      premium_used = CASE WHEN v_res.source = 'PREMIUM' AND premium_day = v_res.server_day
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

CREATE OR REPLACE FUNCTION public.grant_flow_reward(
  p_user_id uuid,
  p_event_id text,
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tz text := 'UTC';
  v_tz_candidate text;
  v_day date;
  v_row public.credite_ai%ROWTYPE;
  v_key text := 'reward:' || p_event_id;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  IF EXISTS (SELECT 1 FROM public.credite_tranzactii WHERE event_id = v_key) THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'replay', true);
  END IF;
  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;

  v_tz_candidate := coalesce(nullif(trim(v_row.timezone), ''), 'UTC');
  BEGIN
    PERFORM p_now AT TIME ZONE v_tz_candidate;
    v_tz := v_tz_candidate;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_tz := 'UTC';
  END;
  v_day := (p_now AT TIME ZONE v_tz)::date;

  IF v_row.reward_day IS NULL OR v_day > v_row.reward_day THEN
    v_row.reward_day := v_day;
    v_row.rewarded_grants_today := 0;
  END IF;
  IF v_row.rewarded_grants_today >= p_daily_limit THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', 'REWARDED_DAILY_LIMIT');
  END IF;
  UPDATE public.credite_ai SET
    reward_day = v_day,
    rewarded_grants_today = v_row.rewarded_grants_today + 1,
    rewarded_balance = rewarded_balance + 1,
    updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO public.credite_tranzactii(user_id, event_id, event_type, credite_delta, metadata)
  VALUES (p_user_id, v_key, 'REWARDED_GRANT', 1, jsonb_build_object('server_day', v_day));
  RETURN jsonb_build_object('applied', true, 'amount', 1, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit_v2(uuid, text, text, text, timestamptz, integer, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.settle_flow_photo_credit(uuid, uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_flow_photo_credit(uuid, uuid, text, text, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.grant_flow_reward(uuid, text, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_flow_reward(uuid, text, timestamptz, integer)
  TO service_role;
