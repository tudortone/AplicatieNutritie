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
  exercitii JSONB DEFAULT '[]'::jsonb,
  volum_total NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS exercitii JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS volum_total NUMERIC DEFAULT 0;

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

-- ==============================================================================
-- 7. TABELA BARCODE CACHE (V5) — Cache produse & supermarketuri locale (Lidl, Kaufland, Penny, etc.)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS barcode_cache (
  code TEXT PRIMARY KEY,
  source TEXT,
  brand TEXT,
  name TEXT NOT NULL,
  quantity TEXT,
  kcal_100g NUMERIC,
  protein_100g NUMERIC,
  carbs_100g NUMERIC,
  fat_100g NUMERIC,
  payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS barcode_cache_updated_at_idx ON barcode_cache(updated_at DESC);

-- ==============================================================================
-- 8. TABELA GAMIFICARE (G1) — XP, nivel, streak și insigne utilizator
-- ==============================================================================
CREATE TABLE IF NOT EXISTS gamificare (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  xp_total INTEGER DEFAULT 0,
  nivel INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  ultima_zi_activa TEXT,
  questuri_azi JSONB DEFAULT '[]'::jsonb,
  insigne JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gamificare_user_id_idx ON gamificare(user_id);

ALTER TABLE IF EXISTS gamificare ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own gamification" ON gamificare;
CREATE POLICY "Users can manage their own gamification" ON gamificare
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


