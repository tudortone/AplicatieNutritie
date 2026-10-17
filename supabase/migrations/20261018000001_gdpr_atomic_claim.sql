-- =============================================================================
-- GDPR-01: Atomic single-owner claim and lease mechanism for gdpr_deletions
-- =============================================================================
-- Previne procesarea concurentă a aceluiași rând de outbox între ruta sincronă
-- și workerii asincroni, sau între instanțe paralele de worker (CAS / lease).

ALTER TABLE public.gdpr_deletions
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

COMMENT ON COLUMN public.gdpr_deletions.claimed_by IS 'Identificator unic al instanței de worker sau rutei care deține lease-ul activ.';
COMMENT ON COLUMN public.gdpr_deletions.lease_expires_at IS 'Data/ora expirării lease-ului (pentru recuperare după timeout/crash).';

CREATE INDEX IF NOT EXISTS idx_gdpr_deletions_lease ON public.gdpr_deletions (lease_expires_at)
  WHERE status NOT IN ('completed', 'failed');

-- RPC atomică pentru preluarea exclusivă a unui rând outbox
CREATE OR REPLACE FUNCTION public.claim_gdpr_deletion(
  p_id uuid,
  p_worker_id text,
  p_expected_status text,
  p_lease_seconds int DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.gdpr_deletions
  SET
    claimed_by = p_worker_id,
    claimed_at = NOW(),
    lease_expires_at = NOW() + (p_lease_seconds || ' seconds')::interval
  WHERE id = p_id
    AND status = p_expected_status
    AND status NOT IN ('completed', 'failed')
    AND (lease_expires_at IS NULL OR lease_expires_at < NOW());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_gdpr_deletion(uuid, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_gdpr_deletion(uuid, text, text, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gdpr_deletion(uuid, text, text, int) TO service_role;
