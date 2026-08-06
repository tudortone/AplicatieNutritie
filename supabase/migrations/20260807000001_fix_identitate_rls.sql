-- =============================================================================
-- P-03 / P-04 / P-20: Identitate, RLS Clerk, trigger updated_at
-- =============================================================================
-- P-03 Plan A: JWT template Supabase pentru utilizatorii Clerk
-- Presupune configurarea în dashboard-ul Clerk:
--   Audience: "authenticated", Role: "authenticated"
--   Claim "sub" = supabase_user_id din clerk_user_map
-- P-04: politica ai_jobs funcționează automat după P-03 Plan A
-- P-20: trigger updated_at pe toate tabelele care îl au definit dar nu actualizat

-- -------------------------------------------------------------------------
-- P-20: trigger updated_at pe tabelele care lipsesc
-- -------------------------------------------------------------------------

-- Funcție generică pentru updated_at (dacă nu există deja)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ai_jobs: updated_at nu se actualiza niciodată (P-20)
DROP TRIGGER IF EXISTS trg_ai_jobs_updated_at ON ai_jobs;
CREATE TRIGGER trg_ai_jobs_updated_at
  BEFORE UPDATE ON ai_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- mese: asigurăm că există
DROP TRIGGER IF EXISTS trg_mese_updated_at ON mese;
CREATE TRIGGER trg_mese_updated_at
  BEFORE UPDATE ON mese
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- profil: asigurăm că există
DROP TRIGGER IF EXISTS trg_profil_updated_at ON profil;
CREATE TRIGGER trg_profil_updated_at
  BEFORE UPDATE ON profil
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------------------
-- P-04: politică RLS pe ai_jobs care funcționează și cu Clerk JWT template
-- -------------------------------------------------------------------------
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_jobs_user_own ON ai_jobs;
CREATE POLICY ai_jobs_user_own ON ai_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- P-03 Plan C: Funcție RPC pentru lookup utilizator după email
-- (folosită de webhooks.js în loc de listUsers paginat)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_auth_user_by_email(p_email text)
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id, email::text
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
$$;

-- Doar backend-ul (service_role) poate apela această funcție
REVOKE ALL ON FUNCTION get_auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_auth_user_by_email(text) TO service_role;

COMMENT ON FUNCTION get_auth_user_by_email IS
  'P-08: caută un utilizator în auth.users după email, fără paginare (înlocuiește listUsers perPage:1000).';
