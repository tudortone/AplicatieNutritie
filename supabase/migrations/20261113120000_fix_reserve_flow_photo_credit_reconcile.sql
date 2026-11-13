-- Fix P0 regression: 20261111100000 overwrote reserve_flow_photo_credit without
-- calling reconcile_flow_photo_result and without the outcome_unknown_at IS NULL guard
-- introduced in 20261020130000, AND re-granted EXECUTE on flow_credits_balance and
-- reserve_flow_photo_credit to authenticated clients.
-- This migration restores durable reconciliation + outcome-unknown exclusion while
-- preserving the cumulative starter quota logic and restricting execution to service_role.

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

REVOKE ALL ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer)
  TO service_role;

