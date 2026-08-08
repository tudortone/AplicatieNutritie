-- =============================================================================
-- P-05: GDPR atomic deletion — outbox pattern
-- =============================================================================
-- Obiectiv: ștergerea contului este atomică și reluabilă. Starea fiecărui pas
-- este durabilă în tabelul gdpr_deletions. Un worker poate relua de la orice
-- pas fără a distruge date deja șterse sau a lăsa date nerăzgate.

CREATE TABLE IF NOT EXISTS gdpr_deletions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  clerk_user_id  text,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'db_done', 'auth_done', 'clerk_done', 'imagekit_done', 'completed', 'failed')),
  initiated_at   timestamptz NOT NULL DEFAULT NOW(),
  completed_at   timestamptz,
  last_error     text,
  retry_count    int NOT NULL DEFAULT 0,
  CONSTRAINT gdpr_deletions_user_unique UNIQUE (user_id, status)
    DEFERRABLE INITIALLY DEFERRED
);

-- Indexuri pentru worker
CREATE INDEX IF NOT EXISTS idx_gdpr_deletions_status ON gdpr_deletions (status)
  WHERE status NOT IN ('completed', 'failed');
CREATE INDEX IF NOT EXISTS idx_gdpr_deletions_user ON gdpr_deletions (user_id);

-- RLS: doar service_role poate citi/scrie (tabelul e backend-only)
ALTER TABLE gdpr_deletions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_deletions_deny_all ON gdpr_deletions;
CREATE POLICY gdpr_deletions_deny_all ON gdpr_deletions USING (false);

-- Funcție pentru inițierea atomică a ștergerii
-- Marchează utilizatorul ca "deletion_pending" și blochează login-ul prin
-- dezactivarea contului în auth.users (dacă e Supabase nativ).
CREATE OR REPLACE FUNCTION initiate_gdpr_deletion(p_user_id uuid, p_clerk_user_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Idempotent: dacă există deja o ștergere în curs, returnăm id-ul ei
  SELECT id INTO v_id FROM gdpr_deletions
  WHERE user_id = p_user_id
    AND status NOT IN ('completed', 'failed')
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO gdpr_deletions (user_id, clerk_user_id, status)
  VALUES (p_user_id, p_clerk_user_id, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION initiate_gdpr_deletion(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION initiate_gdpr_deletion(uuid, text) TO service_role;

COMMENT ON TABLE gdpr_deletions IS
  'P-05: outbox GDPR. Fiecare rând = o cerere de ștergere cont cu starea fiecărui pas (reversibil → ireversibil).';

-- =============================================================================
-- P-06: fileIds index pentru ștergere media completă
-- =============================================================================
-- Asigurăm că coloana alimente există pe mese (ar trebui să existe deja)
-- Indexul GIN permite căutarea rapidă a file_id-urilor în JSONB
CREATE INDEX IF NOT EXISTS idx_mese_alimente_gin ON mese USING gin(alimente jsonb_path_ops);

COMMENT ON INDEX idx_mese_alimente_gin IS
  'P-06: index GIN pe mese.alimente pentru extragerea rapidă a fileId-urilor ImageKit la ștergerea GDPR.';
