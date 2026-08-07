-- =============================================================================
-- P-08d: Setare search_path pe functia clerk_webhook_esuate_protect_created_at
-- =============================================================================

CREATE OR REPLACE FUNCTION clerk_webhook_esuate_protect_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
