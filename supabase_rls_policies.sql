-- ==============================================================================
-- NUTRIAI - POLITICI DE ROW LEVEL SECURITY (RLS) PENTRU SUPABASE
-- Conform punctului 1.1.5 și 2.1.4 din Raportul de Audit
-- ==============================================================================

-- 1. ACTIVARE RLS PE TABELA DE MESE
ALTER TABLE IF EXISTS mese ENABLE ROW LEVEL SECURITY;

-- Adăugare coloane noi pentru categorii mese (Mic Dejun, Prânz, Cină, Gustări) și alimente detaliate (JSONB)
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS tip_masa VARCHAR;
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS alimente JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS fibre INTEGER DEFAULT 0;

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

-- ==============================================================================
-- 9. MIGRĂRI IDEMPOTENTE NUTRIAI v6 (AGENT B & AGENT C)
-- ==============================================================================

-- Extindere produse_camara pentru catalog personal & introducere manuală (B6)
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS kcal_100g NUMERIC;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS proteine_100g NUMERIC;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS carbohidrati_100g NUMERIC;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS grasimi_100g NUMERIC;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS fibre_100g NUMERIC;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS portie_label TEXT;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS portie_grame NUMERIC;
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE IF EXISTS produse_camara ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS produse_camara_user_id_idx ON produse_camara(user_id);
CREATE INDEX IF NOT EXISTS produse_camara_lower_nume_idx ON produse_camara(LOWER(nume));
CREATE INDEX IF NOT EXISTS produse_camara_barcode_idx ON produse_camara(barcode) WHERE barcode IS NOT NULL;

-- Extindere antrenamente pentru Body Heatmap, Volum kg & Mastery Rank (C7)
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS muscle_load JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS external_volume_kg NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS equivalent_volume_kg NUMERIC;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS session_score INTEGER;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS rank_key TEXT;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS rank_label TEXT;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS calculation_version INTEGER DEFAULT 1;
ALTER TABLE IF EXISTS antrenamente ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ==============================================================================
-- 10. MIGRĂRI IDEMPOTENTE NUTRIAI v7 — FITNESS ADAPTIV (exercises + workout_logs)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  equipment text NOT NULL CHECK (equipment IN ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','band')),
  target_muscles text[] NOT NULL,
  input_type text NOT NULL CHECK (input_type IN ('hold','bodyweight_reps','weighted_reps')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read exercises catalog" ON exercises;
CREATE POLICY "Anyone can read exercises catalog" ON exercises
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  set_index int NOT NULL,
  reps int,
  weight_kg numeric(6,2),
  time_seconds int,
  CONSTRAINT valid_metrics CHECK (
    (reps IS NULL OR reps > 0) AND
    (weight_kg IS NULL OR weight_kg > 0) AND
    (time_seconds IS NULL OR time_seconds > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON workout_logs(user_id, performed_at DESC);

ALTER TABLE IF EXISTS workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own workout logs" ON workout_logs;
CREATE POLICY "Users can manage their own workout logs" ON workout_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);




