CREATE TABLE IF NOT EXISTS public.play_integrity_token_bindings (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL,
  request_hash text NOT NULL,
  content_digest text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS play_integrity_token_bindings_expires_at_idx
  ON public.play_integrity_token_bindings (expires_at);

ALTER TABLE public.play_integrity_token_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.play_integrity_token_bindings FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_play_integrity_token(
  p_token_hash text,
  p_request_hash text,
  p_user_id text,
  p_content_digest text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inserted integer;
  v_existing public.play_integrity_token_bindings%ROWTYPE;
BEGIN
  IF p_token_hash !~ '^[a-f0-9]{64}$'
    OR NULLIF(btrim(p_request_hash), '') IS NULL
    OR NULLIF(btrim(p_user_id), '') IS NULL
    OR p_expires_at IS NULL
    OR p_expires_at <= now() THEN
    RETURN false;
  END IF;

  WITH expired AS (
    SELECT token_hash
    FROM public.play_integrity_token_bindings
    WHERE expires_at <= now()
    ORDER BY expires_at
    LIMIT 500
  )
  DELETE FROM public.play_integrity_token_bindings AS bindings
  USING expired
  WHERE bindings.token_hash = expired.token_hash;

  INSERT INTO public.play_integrity_token_bindings (
    token_hash, user_id, request_hash, content_digest, expires_at
  ) VALUES (
    p_token_hash, p_user_id, p_request_hash, p_content_digest, p_expires_at
  )
  ON CONFLICT (token_hash) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN true;
  END IF;

  SELECT * INTO v_existing
  FROM public.play_integrity_token_bindings
  WHERE token_hash = p_token_hash;

  RETURN FOUND
    AND v_existing.expires_at > now()
    AND v_existing.user_id = p_user_id
    AND v_existing.request_hash = p_request_hash
    AND v_existing.content_digest IS NOT DISTINCT FROM p_content_digest;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_play_integrity_token(text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_play_integrity_token(text, text, text, text, timestamptz)
  TO service_role;
