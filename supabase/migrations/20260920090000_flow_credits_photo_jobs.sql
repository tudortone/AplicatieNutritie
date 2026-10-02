-- GetFlow Flow Credits + durable Photo AI jobs.
-- Evolves the existing credite_ai / credite_tranzactii authority; no parallel ledger.

ALTER TABLE public.credite_ai
  ADD COLUMN IF NOT EXISTS daily_day date,
  ADD COLUMN IF NOT EXISTS daily_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rewarded_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_day date,
  ADD COLUMN IF NOT EXISTS rewarded_grants_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchased_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_day date,
  ADD COLUMN IF NOT EXISTS premium_used integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.credite_ai ADD CONSTRAINT credite_ai_flow_nonnegative CHECK (
    daily_used >= 0 AND rewarded_balance >= 0 AND rewarded_grants_today >= 0
    AND purchased_balance >= 0 AND premium_used >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.flow_credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logical_analysis_id text NOT NULL CHECK (length(logical_analysis_id) BETWEEN 1 AND 256),
  source text NOT NULL CHECK (source IN ('DAILY', 'REWARDED', 'PURCHASED', 'PREMIUM', 'FULL_ACCESS')),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
  server_day date NOT NULL,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (user_id, logical_analysis_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS flow_credit_one_active_per_user
  ON public.flow_credit_reservations(user_id)
  WHERE status = 'RESERVED';

CREATE INDEX IF NOT EXISTS flow_credit_reservations_user_created
  ON public.flow_credit_reservations(user_id, created_at DESC);

ALTER TABLE public.flow_credit_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_credit_reservations_read_own ON public.flow_credit_reservations;
CREATE POLICY flow_credit_reservations_read_own ON public.flow_credit_reservations
  FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.flow_credit_reservations FROM anon, authenticated;
GRANT SELECT ON public.flow_credit_reservations TO authenticated;

ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS logical_analysis_id text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_file_id text,
  ADD COLUMN IF NOT EXISTS credit_reservation_id uuid REFERENCES public.flow_credit_reservations(id),
  ADD COLUMN IF NOT EXISTS queue_name text NOT NULL DEFAULT 'ai-photo',
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_status_check;
ALTER TABLE public.ai_jobs ADD CONSTRAINT ai_jobs_status_check CHECK (
  status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'processing', 'completed')
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_user_logical_unique
  ON public.ai_jobs(user_id, logical_analysis_id)
  WHERE logical_analysis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_jobs_user_active
  ON public.ai_jobs(user_id, created_at DESC)
  WHERE status IN ('queued', 'running', 'processing');

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

  IF v_row.daily_day IS DISTINCT FROM v_day THEN
    UPDATE public.credite_ai SET daily_day = v_day, daily_used = 0 WHERE user_id = p_user_id;
    v_row.daily_day := v_day; v_row.daily_used := 0;
  END IF;
  IF v_row.reward_day IS DISTINCT FROM v_day THEN
    UPDATE public.credite_ai SET reward_day = v_day, rewarded_grants_today = 0 WHERE user_id = p_user_id;
    v_row.reward_day := v_day; v_row.rewarded_grants_today := 0;
  END IF;
  IF v_row.premium_day IS DISTINCT FROM v_day THEN
    UPDATE public.credite_ai SET premium_day = v_day, premium_used = 0 WHERE user_id = p_user_id;
    v_row.premium_day := v_day; v_row.premium_used := 0;
  END IF;

  v_daily_remaining := greatest(0, p_daily_limit - v_row.daily_used);
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day date := (p_now AT TIME ZONE 'UTC')::date;
  v_row public.credite_ai%ROWTYPE;
  v_key text := 'reward:' || p_event_id;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  IF EXISTS (SELECT 1 FROM public.credite_tranzactii WHERE event_id = v_key) THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'replay', true);
  END IF;
  INSERT INTO public.credite_ai(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_row FROM public.credite_ai WHERE user_id = p_user_id FOR UPDATE;
  IF v_row.reward_day IS DISTINCT FROM v_day THEN
    v_row.reward_day := v_day; v_row.rewarded_grants_today := 0;
  END IF;
  IF v_row.rewarded_grants_today >= p_daily_limit THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', 'REWARDED_DAILY_LIMIT');
  END IF;
  UPDATE public.credite_ai SET reward_day = v_day,
    rewarded_grants_today = v_row.rewarded_grants_today + 1,
    rewarded_balance = rewarded_balance + 1, updated_at = now()
    WHERE user_id = p_user_id;
  INSERT INTO public.credite_tranzactii(user_id, event_id, event_type, credite_delta, metadata)
  VALUES (p_user_id, v_key, 'REWARDED_GRANT', 1, jsonb_build_object('server_day', v_day));
  RETURN jsonb_build_object('applied', true, 'amount', 1, 'replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_flow_pack(
  p_user_id uuid,
  p_event_id text,
  p_product_id text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount integer;
  v_key text := 'pack:' || p_event_id;
BEGIN
  v_amount := CASE p_product_id WHEN 'getflow_credits_10' THEN 10
    WHEN 'getflow_credits_30' THEN 30 ELSE 0 END;
  IF v_amount = 0 THEN RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', 'PRODUCT_NOT_ALLOWED'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 84107));
  IF EXISTS (SELECT 1 FROM public.credite_tranzactii WHERE event_id = v_key) THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'replay', true);
  END IF;
  INSERT INTO public.credite_ai(user_id, purchased_balance) VALUES (p_user_id, v_amount)
  ON CONFLICT (user_id) DO UPDATE SET purchased_balance = public.credite_ai.purchased_balance + v_amount,
    updated_at = now();
  INSERT INTO public.credite_tranzactii(user_id, event_id, event_type, credite_delta, produs_id, metadata)
  VALUES (p_user_id, v_key, CASE v_amount WHEN 10 THEN 'PACK_10_GRANT' ELSE 'PACK_30_GRANT' END,
    v_amount, p_product_id, jsonb_build_object('verified_at', p_now));
  RETURN jsonb_build_object('applied', true, 'amount', v_amount, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_flow_photo_credit(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_flow_reward(uuid, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_flow_pack(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flow_credits_balance(uuid, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_flow_photo_credit(uuid, text, text, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_flow_photo_credit(uuid, uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_flow_reward(uuid, text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_flow_pack(uuid, text, text, timestamptz) TO service_role;

COMMENT ON TABLE public.flow_credit_reservations IS
  'Server-authoritative, exactly-once Photo AI credit reservation; writes are service_role only.';
