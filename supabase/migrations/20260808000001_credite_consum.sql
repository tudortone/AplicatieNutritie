-- =============================================================================
-- S2 P-01b: Stocare credite esuate + funcție atomică de consumare credite plătite
-- =============================================================================

CREATE TABLE IF NOT EXISTS credite_esuate (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     text UNIQUE NOT NULL,
  app_user_id  text NOT NULL,
  product_id   text,
  credite      integer NOT NULL DEFAULT 0,
  motiv        text NOT NULL,
  payload      jsonb,
  rezolvat     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE credite_esuate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credite_esuate_deny_all ON credite_esuate;
CREATE POLICY credite_esuate_deny_all ON credite_esuate FOR ALL USING (false);

-- Consumul creditelor plătite. Returnează soldul rămas, sau -1 dacă nu are.
CREATE OR REPLACE FUNCTION consuma_credit(p_user_id uuid, p_cost integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sold integer;
BEGIN
  UPDATE credite_ai
     SET sold = sold - p_cost,
         updated_at = now()
   WHERE user_id = p_user_id AND sold >= p_cost
   RETURNING sold INTO v_sold;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN v_sold;
END;
$$;

REVOKE ALL ON FUNCTION consuma_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consuma_credit(uuid, integer) TO service_role;
