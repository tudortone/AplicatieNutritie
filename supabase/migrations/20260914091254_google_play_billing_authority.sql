-- P0-BILLING-01: autoritate server-side pentru abonamentele Google Play.
-- Tokenurile brute sunt necesare exclusiv backend-ului pentru Developer API;
-- rolurile client nu au privilegii pe aceste tabele sau functii.

CREATE TABLE public.google_play_subscriptions (
  purchase_token TEXT PRIMARY KEY,
  purchase_token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  base_plan_id TEXT,
  offer_id TEXT,
  subscription_state TEXT NOT NULL,
  expiry_time TIMESTAMPTZ,
  acknowledgement_state TEXT NOT NULL,
  linked_purchase_token TEXT,
  replaced_by_purchase_token TEXT,
  is_entitled BOOLEAN NOT NULL DEFAULT FALSE,
  is_test_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  verification_started_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ack_retry_count INTEGER NOT NULL DEFAULT 0 CHECK (ack_retry_count >= 0),
  ack_next_retry_at TIMESTAMPTZ,
  ack_lease_until TIMESTAMPTZ,
  ack_last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_play_purchase_token_length CHECK (char_length(purchase_token) BETWEEN 20 AND 4096),
  CONSTRAINT google_play_purchase_token_hash_format CHECK (purchase_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT google_play_product_id_format CHECK (product_id ~ '^[a-z0-9][a-z0-9._]*$'),
  CONSTRAINT google_play_link_not_self CHECK (
    linked_purchase_token IS NULL OR linked_purchase_token <> purchase_token
  ),
  CONSTRAINT google_play_replacement_not_self CHECK (
    replaced_by_purchase_token IS NULL OR replaced_by_purchase_token <> purchase_token
  )
);

CREATE INDEX google_play_subscriptions_user_entitlement_idx
  ON public.google_play_subscriptions (user_id, is_entitled, expiry_time DESC);
CREATE INDEX google_play_subscriptions_ack_due_idx
  ON public.google_play_subscriptions (ack_next_retry_at)
  WHERE acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_PENDING';
CREATE INDEX google_play_subscriptions_linked_token_idx
  ON public.google_play_subscriptions (linked_purchase_token)
  WHERE linked_purchase_token IS NOT NULL;

CREATE TABLE public.google_play_rtdn_events (
  message_id TEXT PRIMARY KEY,
  publish_time TIMESTAMPTZ,
  event_time TIMESTAMPTZ,
  package_name TEXT NOT NULL,
  notification_type INTEGER,
  purchase_token_hash TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'retryable_error', 'permanent_error')),
  error_code TEXT,
  processing_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_attempts INTEGER NOT NULL DEFAULT 1 CHECK (processing_attempts > 0),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_play_rtdn_message_id_not_empty CHECK (char_length(message_id) BETWEEN 1 AND 512),
  CONSTRAINT google_play_rtdn_hash_format CHECK (
    purchase_token_hash IS NULL OR purchase_token_hash ~ '^[a-f0-9]{64}$'
  )
);

ALTER TABLE public.google_play_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_play_rtdn_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.google_play_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.google_play_rtdn_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_play_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_play_rtdn_events TO service_role;

CREATE OR REPLACE FUNCTION public.apply_google_play_subscription_verification(
  p_user_id UUID,
  p_purchase_token TEXT,
  p_purchase_token_hash TEXT,
  p_product_id TEXT,
  p_base_plan_id TEXT,
  p_offer_id TEXT,
  p_subscription_state TEXT,
  p_expiry_time TIMESTAMPTZ,
  p_acknowledgement_state TEXT,
  p_linked_purchase_token TEXT,
  p_is_entitled BOOLEAN,
  p_is_test_purchase BOOLEAN,
  p_verification_started_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner UUID;
  v_row public.google_play_subscriptions%ROWTYPE;
  v_applied BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL OR p_purchase_token IS NULL OR p_purchase_token_hash IS NULL OR
     p_product_id IS NULL OR p_subscription_state IS NULL OR
     p_acknowledgement_state IS NULL OR p_verification_started_at IS NULL THEN
    RAISE EXCEPTION 'google_play_invalid_verification';
  END IF;

  -- Blocheaza tokenul curent si cel inlocuit intr-o ordine determinista.
  PERFORM 1
    FROM public.google_play_subscriptions
   WHERE purchase_token = p_purchase_token
      OR (p_linked_purchase_token IS NOT NULL AND purchase_token = p_linked_purchase_token)
   ORDER BY purchase_token
   FOR UPDATE;

  SELECT user_id INTO v_owner
    FROM public.google_play_subscriptions
   WHERE purchase_token = p_purchase_token;
  IF v_owner IS NOT NULL AND v_owner <> p_user_id THEN
    RAISE EXCEPTION 'google_play_token_owned_by_another_user';
  END IF;

  IF p_linked_purchase_token IS NOT NULL THEN
    v_owner := NULL;
    SELECT user_id INTO v_owner
      FROM public.google_play_subscriptions
     WHERE purchase_token = p_linked_purchase_token;
    IF v_owner IS NOT NULL AND v_owner <> p_user_id THEN
      RAISE EXCEPTION 'google_play_token_owned_by_another_user';
    END IF;
  END IF;

  INSERT INTO public.google_play_subscriptions (
    purchase_token,
    purchase_token_hash,
    user_id,
    product_id,
    base_plan_id,
    offer_id,
    subscription_state,
    expiry_time,
    acknowledgement_state,
    linked_purchase_token,
    is_entitled,
    is_test_purchase,
    verification_started_at,
    verified_at,
    ack_next_retry_at,
    updated_at
  ) VALUES (
    p_purchase_token,
    p_purchase_token_hash,
    p_user_id,
    p_product_id,
    p_base_plan_id,
    p_offer_id,
    p_subscription_state,
    p_expiry_time,
    p_acknowledgement_state,
    p_linked_purchase_token,
    p_is_entitled,
    p_is_test_purchase,
    p_verification_started_at,
    NOW(),
    CASE WHEN p_acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_PENDING' AND p_is_entitled
      THEN NOW() ELSE NULL END,
    NOW()
  )
  ON CONFLICT (purchase_token) DO UPDATE SET
    purchase_token_hash = EXCLUDED.purchase_token_hash,
    product_id = EXCLUDED.product_id,
    base_plan_id = EXCLUDED.base_plan_id,
    offer_id = EXCLUDED.offer_id,
    subscription_state = EXCLUDED.subscription_state,
    expiry_time = EXCLUDED.expiry_time,
    acknowledgement_state = CASE
      WHEN public.google_play_subscriptions.acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
        THEN public.google_play_subscriptions.acknowledgement_state
      ELSE EXCLUDED.acknowledgement_state
    END,
    linked_purchase_token = EXCLUDED.linked_purchase_token,
    is_entitled = EXCLUDED.is_entitled AND
      public.google_play_subscriptions.replaced_by_purchase_token IS NULL,
    is_test_purchase = EXCLUDED.is_test_purchase,
    verification_started_at = EXCLUDED.verification_started_at,
    verified_at = NOW(),
    ack_next_retry_at = CASE
      WHEN public.google_play_subscriptions.acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
        THEN NULL
      WHEN EXCLUDED.acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_PENDING' AND EXCLUDED.is_entitled
        THEN COALESCE(public.google_play_subscriptions.ack_next_retry_at, NOW())
      ELSE NULL
    END,
    ack_lease_until = NULL,
    updated_at = NOW()
  WHERE public.google_play_subscriptions.user_id = EXCLUDED.user_id
    AND public.google_play_subscriptions.verification_started_at <= EXCLUDED.verification_started_at
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_applied := TRUE;
  ELSE
    SELECT * INTO v_row
      FROM public.google_play_subscriptions
     WHERE purchase_token = p_purchase_token
     FOR UPDATE;
    IF v_row.user_id <> p_user_id THEN
      RAISE EXCEPTION 'google_play_token_owned_by_another_user';
    END IF;
  END IF;

  -- Un replacement activ pensioneaza tokenul vechi. Un pending purchase care
  -- a fost anulat NU pensioneaza abonamentul vechi indicat de linked token.
  IF v_applied AND p_is_entitled AND p_linked_purchase_token IS NOT NULL THEN
    UPDATE public.google_play_subscriptions
       SET is_entitled = FALSE,
           replaced_by_purchase_token = p_purchase_token,
           ack_next_retry_at = NULL,
           ack_lease_until = NULL,
           updated_at = NOW()
     WHERE purchase_token = p_linked_purchase_token
       AND user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'subscription', to_jsonb(v_row) - 'purchase_token'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_google_play_acknowledgements(
  p_limit INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (purchase_token TEXT, product_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH due AS (
    SELECT s.purchase_token
      FROM public.google_play_subscriptions AS s
     WHERE s.is_entitled = TRUE
       AND s.acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_PENDING'
       AND s.ack_next_retry_at <= NOW()
       AND (s.ack_lease_until IS NULL OR s.ack_lease_until < NOW())
     ORDER BY s.ack_next_retry_at, s.purchase_token
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(p_limit, 1), 100)
  ), leased AS (
    UPDATE public.google_play_subscriptions AS s
       SET ack_lease_until = NOW() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 5), 600)),
           ack_retry_count = s.ack_retry_count + 1,
           updated_at = NOW()
      FROM due
     WHERE s.purchase_token = due.purchase_token
    RETURNING s.purchase_token, s.product_id
  )
  SELECT leased.purchase_token, leased.product_id FROM leased;
$$;

CREATE OR REPLACE FUNCTION public.apply_google_play_acknowledgement_result(
  p_purchase_token TEXT,
  p_succeeded BOOLEAN,
  p_error_code TEXT DEFAULT NULL,
  p_next_retry_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.google_play_subscriptions
     SET acknowledgement_state = CASE WHEN p_succeeded
           THEN 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
           ELSE acknowledgement_state END,
         ack_next_retry_at = CASE WHEN p_succeeded THEN NULL
           ELSE COALESCE(p_next_retry_at, NOW() + INTERVAL '5 minutes') END,
         ack_lease_until = NULL,
         ack_last_error_code = CASE WHEN p_succeeded THEN NULL ELSE LEFT(p_error_code, 128) END,
         updated_at = NOW()
   WHERE purchase_token = p_purchase_token
     AND acknowledgement_state = 'ACKNOWLEDGEMENT_STATE_PENDING';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_google_play_rtdn_event(
  p_message_id TEXT,
  p_publish_time TIMESTAMPTZ,
  p_event_time TIMESTAMPTZ,
  p_package_name TEXT,
  p_notification_type INTEGER,
  p_purchase_token_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.google_play_rtdn_events (
    message_id,
    publish_time,
    event_time,
    package_name,
    notification_type,
    purchase_token_hash,
    processing_status
  ) VALUES (
    p_message_id,
    p_publish_time,
    p_event_time,
    p_package_name,
    p_notification_type,
    p_purchase_token_hash,
    'received'
  )
  ON CONFLICT (message_id) DO UPDATE SET
    processing_status = 'received',
    processing_started_at = NOW(),
    processing_attempts = public.google_play_rtdn_events.processing_attempts + 1,
    error_code = NULL,
    processed_at = NULL,
    updated_at = NOW()
  WHERE public.google_play_rtdn_events.processing_status = 'retryable_error'
     OR (
       public.google_play_rtdn_events.processing_status = 'received'
       AND public.google_play_rtdn_events.processing_started_at < NOW() - INTERVAL '5 minutes'
     );
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_google_play_rtdn_event(
  p_message_id TEXT,
  p_processing_status TEXT,
  p_error_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_processing_status NOT IN ('processed', 'ignored', 'retryable_error', 'permanent_error') THEN
    RAISE EXCEPTION 'google_play_invalid_rtdn_status';
  END IF;
  UPDATE public.google_play_rtdn_events
     SET processing_status = p_processing_status,
         error_code = LEFT(p_error_code, 128),
         processed_at = CASE WHEN p_processing_status IN ('processed', 'ignored', 'permanent_error')
           THEN NOW() ELSE NULL END,
         updated_at = NOW()
   WHERE message_id = p_message_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_google_play_subscription_verification(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_google_play_acknowledgements(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_google_play_acknowledgement_result(TEXT, BOOLEAN, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_google_play_rtdn_event(
  TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_google_play_rtdn_event(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_google_play_subscription_verification(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_google_play_acknowledgements(INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_google_play_acknowledgement_result(TEXT, BOOLEAN, TEXT, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_google_play_rtdn_event(
  TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_google_play_rtdn_event(TEXT, TEXT, TEXT)
  TO service_role;
