-- ==============================================================================
-- NUTRIAI - POLITICI DE ROW LEVEL SECURITY (RLS) PENTRU SUPABASE
-- Conform punctului 1.1.5 și 2.1.4 din Raportul de Audit
-- ==============================================================================

-- 1. ACTIVARE RLS PE TABELA DE MESE
ALTER TABLE IF EXISTS mese ENABLE ROW LEVEL SECURITY;

-- 2. POLITICĂ PENTRU TABELA 'mese': Utilizatorii își pot accesa doar propriile mese
DROP POLICY IF EXISTS "Users can only access their own meals" ON mese;

CREATE POLICY "Users can only access their own meals" ON mese
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. ACTIVARE RLS PE TABELA DE PROFIL (Dacă există ca tabelă separată)
ALTER TABLE IF EXISTS profil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own profile" ON profil;

CREATE POLICY "Users can only access their own profile" ON profil
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 4. [PARTEA 2 - 2.1.4] CREARE ȘI SECURIZARE TABELĂ DE AUDIT LOG
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own audit logs" ON audit_log;
CREATE POLICY "Users can insert their own audit logs" ON audit_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own audit logs" ON audit_log;
CREATE POLICY "Users can view their own audit logs" ON audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- ==============================================================================
-- 5. TABELA ANTRENAMENTE (A1) — Sport și calorii arse
-- ==============================================================================
CREATE TABLE IF NOT EXISTS antrenamente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nume TEXT NOT NULL,
  tip TEXT NOT NULL,
  durata_min INTEGER NOT NULL DEFAULT 30,
  calorii_arse INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS antrenamente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own workouts" ON antrenamente;
CREATE POLICY "Users can access their own workouts" ON antrenamente
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6. TABELA PRODUSE_CAMARA (A2) — Cămara mea & produse scanate prin barcode
-- ==============================================================================
CREATE TABLE IF NOT EXISTS produse_camara (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  nume TEXT NOT NULL,
  brand TEXT,
  calorii_100g NUMERIC NOT NULL DEFAULT 0,
  proteine_100g NUMERIC NOT NULL DEFAULT 0,
  grasimi_100g NUMERIC NOT NULL DEFAULT 0,
  carbohidrati_100g NUMERIC NOT NULL DEFAULT 0,
  imagine_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS produse_camara ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own pantry products" ON produse_camara;
CREATE POLICY "Users can access their own pantry products" ON produse_camara
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- INSTRUCȚIUNI DE APLICARE:
-- Copiază și rulează acest conținut în SQL Editor din dashboard-ul tău Supabase
-- pentru a asigura izolare completă a datelor între utilizatori (Zero Trust).
-- ==============================================================================
