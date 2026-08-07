-- =============================================================================
-- P-08b: Trigger BEFORE UPDATE pe clerk_webhook_esuate care protejeaza
--        created_at — la fiecare UPDATE, ora primului esec se pastreaza.
-- =============================================================================

CREATE OR REPLACE FUNCTION clerk_webhook_esuate_protect_created_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_created_at ON clerk_webhook_esuate;
CREATE TRIGGER trg_protect_created_at
  BEFORE UPDATE ON clerk_webhook_esuate
  FOR EACH ROW
  EXECUTE FUNCTION clerk_webhook_esuate_protect_created_at();
