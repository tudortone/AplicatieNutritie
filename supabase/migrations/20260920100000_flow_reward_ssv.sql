-- AdMob rewarded SSV intents. The callback is public but only a valid Google
-- signature plus the one-time opaque intent secret can reach the credit RPC.

CREATE TABLE IF NOT EXISTS public.flow_reward_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_data_hash text NOT NULL CHECK (custom_data_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'GRANTED', 'DENIED_LIMIT', 'EXPIRED')),
  transaction_id text UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz
);

CREATE INDEX IF NOT EXISTS flow_reward_intents_user_created_idx
  ON public.flow_reward_intents(user_id, created_at DESC);

ALTER TABLE public.flow_reward_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flow_reward_intents_read_own ON public.flow_reward_intents;
CREATE POLICY flow_reward_intents_read_own ON public.flow_reward_intents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.flow_reward_intents FROM anon, authenticated;
GRANT SELECT ON public.flow_reward_intents TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_flow_reward_ssv(
  p_intent_id uuid,
  p_custom_data_hash text,
  p_transaction_id text,
  p_now timestamptz DEFAULT now(),
  p_daily_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_intent public.flow_reward_intents%ROWTYPE;
  v_reward jsonb;
BEGIN
  IF p_custom_data_hash !~ '^[a-f0-9]{64}$' OR length(p_transaction_id) NOT BETWEEN 1 AND 256 THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', 'INVALID_SSV_EVENT');
  END IF;
  SELECT * INTO v_intent FROM public.flow_reward_intents
    WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_intent.custom_data_hash <> p_custom_data_hash THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', 'INTENT_NOT_FOUND');
  END IF;
  IF v_intent.status = 'GRANTED' THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0,
      'replay', v_intent.transaction_id = p_transaction_id,
      'code', CASE WHEN v_intent.transaction_id = p_transaction_id THEN 'REPLAY' ELSE 'INTENT_ALREADY_USED' END);
  END IF;
  IF v_intent.status <> 'PENDING' THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', v_intent.status);
  END IF;
  IF v_intent.expires_at <= p_now THEN
    UPDATE public.flow_reward_intents SET status = 'EXPIRED' WHERE id = p_intent_id;
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'code', 'INTENT_EXPIRED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.flow_reward_intents
    WHERE transaction_id = p_transaction_id AND id <> p_intent_id
  ) THEN
    RETURN jsonb_build_object('applied', false, 'amount', 0, 'replay', true, 'code', 'TRANSACTION_REPLAY');
  END IF;

  v_reward := public.grant_flow_reward(
    v_intent.user_id, 'admob:' || p_transaction_id, p_now, p_daily_limit
  );
  IF COALESCE((v_reward->>'applied')::boolean, false) OR COALESCE((v_reward->>'replay')::boolean, false) THEN
    UPDATE public.flow_reward_intents SET status = 'GRANTED', transaction_id = p_transaction_id,
      granted_at = p_now WHERE id = p_intent_id;
  ELSIF v_reward->>'code' = 'REWARDED_DAILY_LIMIT' THEN
    UPDATE public.flow_reward_intents SET status = 'DENIED_LIMIT', transaction_id = p_transaction_id
      WHERE id = p_intent_id;
  END IF;
  RETURN v_reward;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_flow_reward_ssv(uuid, text, text, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_flow_reward_ssv(uuid, text, text, timestamptz, integer)
  TO service_role;

COMMENT ON TABLE public.flow_reward_intents IS
  'Opaque one-time AdMob SSV evidence; no ad payload or account PII is stored.';
