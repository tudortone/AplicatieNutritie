-- =============================================================================
-- GDPR-01: Atomic single-owner claim, fencing token and lease mechanism
-- =============================================================================
-- Previne procesarea concurentă a aceluiași rând de outbox între ruta sincronă
-- și workerii asincroni, sau între instanțe paralele de worker.
-- Include generație monotonică (fencing_token) pentru invalidarea workerilor vechi.

ALTER TABLE public.gdpr_deletions
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS fencing_token bigint DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.gdpr_deletions.claimed_by IS 'Identificator unic al instanței de worker sau rutei care deține lease-ul activ.';
COMMENT ON COLUMN public.gdpr_deletions.lease_expires_at IS 'Data/ora expirării lease-ului (pentru recuperare după timeout/crash).';
COMMENT ON COLUMN public.gdpr_deletions.fencing_token IS 'Generație monotonică pentru respingerea apelurilor întârziate sau a workerilor cu lease expirat.';

CREATE INDEX IF NOT EXISTS idx_gdpr_deletions_lease ON public.gdpr_deletions (lease_expires_at)
  WHERE status NOT IN ('completed', 'failed');

-- RPC atomică pentru preluarea exclusivă a unui rând outbox
-- Întoarce jsonb cu success, fencing_token și lease_expires_at
CREATE OR REPLACE FUNCTION public.claim_gdpr_deletion(
  p_id uuid,
  p_worker_id text,
  p_expected_status text,
  p_lease_seconds int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_token bigint;
  v_new_expires timestamptz;
BEGIN
  IF p_id IS NULL OR p_worker_id IS NULL OR p_worker_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
  END IF;

  v_new_expires := NOW() + (p_lease_seconds || ' seconds')::interval;

  UPDATE public.gdpr_deletions
  SET
    claimed_by = p_worker_id,
    claimed_at = NOW(),
    lease_expires_at = v_new_expires,
    fencing_token = COALESCE(fencing_token, 0) + 1
  WHERE id = p_id
    AND (p_expected_status IS NULL OR status = p_expected_status)
    AND status NOT IN ('completed', 'failed')
    AND (lease_expires_at IS NULL OR lease_expires_at < NOW() OR claimed_by = p_worker_id)
  RETURNING fencing_token, lease_expires_at INTO v_new_token, v_new_expires;

  IF v_new_token IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'fencing_token', v_new_token,
      'lease_expires_at', v_new_expires
    );
  ELSE
    RETURN jsonb_build_object('success', false);
  END IF;
END;
$$;

-- RPC atomică pentru reînnoirea lease-ului de către deținătorul curent
CREATE OR REPLACE FUNCTION public.renew_gdpr_lease(
  p_id uuid,
  p_worker_id text,
  p_fencing_token bigint,
  p_lease_seconds int DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_expires timestamptz;
BEGIN
  IF p_id IS NULL OR p_worker_id IS NULL OR p_fencing_token IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
  END IF;

  v_new_expires := NOW() + (p_lease_seconds || ' seconds')::interval;

  UPDATE public.gdpr_deletions
  SET
    lease_expires_at = v_new_expires
  WHERE id = p_id
    AND claimed_by = p_worker_id
    AND fencing_token = p_fencing_token
    AND lease_expires_at >= NOW()
    AND status NOT IN ('completed', 'failed')
  RETURNING lease_expires_at INTO v_new_expires;

  IF v_new_expires IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'lease_expires_at', v_new_expires);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'LEASE_EXPIRED_OR_STALE');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_gdpr_deletion(uuid, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_gdpr_deletion(uuid, text, text, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gdpr_deletion(uuid, text, text, int) TO service_role;

REVOKE ALL ON FUNCTION public.renew_gdpr_lease(uuid, text, bigint, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_gdpr_lease(uuid, text, bigint, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_gdpr_lease(uuid, text, bigint, int) TO service_role;
