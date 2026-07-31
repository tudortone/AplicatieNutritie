-- ==========================================================
-- NUTRIAI — MIGRARE CORECTIVĂ (idempotentă)
-- Rulează în SQL Editor din dashboard-ul Supabase
-- ==========================================================

-- ⚠️ PAS CRITIC: asigură coloanele esențiale înainte de orice
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS alimente JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS tip_masa TEXT;
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS fibre    NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS data     DATE;
ALTER TABLE IF EXISTS mese ADD COLUMN IF NOT EXISTS ora      TIME;

-- ⚠️ CRITIC: PostgREST ține cache de schemă — fără NOTIFY, PGRST204 persistă
NOTIFY pgrst, 'reload schema';

-- C1: creează mese dacă lipsește (înainte de orice ALTER/POLICY)
CREATE TABLE IF NOT EXISTS mese (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nume          TEXT NOT NULL,
  calorii       NUMERIC NOT NULL DEFAULT 0,
  proteine      NUMERIC NOT NULL DEFAULT 0,
  grasimi       NUMERIC NOT NULL DEFAULT 0,
  carbohidrati  NUMERIC NOT NULL DEFAULT 0,
  fibre         NUMERIC NOT NULL DEFAULT 0,
  tip_masa      TEXT,
  alimente      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profil (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

-- C2: ziua locală, stocată explicit (nu derivată din UTC)
ALTER TABLE mese ADD COLUMN IF NOT EXISTS data DATE;
ALTER TABLE mese ADD COLUMN IF NOT EXISTS ora  TIME;

UPDATE mese
   SET data = (created_at AT TIME ZONE 'Europe/Bucharest')::date,
       ora  = (created_at AT TIME ZONE 'Europe/Bucharest')::time
 WHERE data IS NULL;

CREATE OR REPLACE FUNCTION mese_set_local_day() RETURNS trigger AS $$
BEGIN
  IF NEW.data IS NULL THEN
    NEW.data := (COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Europe/Bucharest')::date;
  END IF;
  IF NEW.ora IS NULL THEN
    NEW.ora  := (COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Europe/Bucharest')::time;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mese_local_day ON mese;
CREATE TRIGGER trg_mese_local_day BEFORE INSERT ON mese
  FOR EACH ROW EXECUTE FUNCTION mese_set_local_day();

-- C3: indexuri pentru query-urile reale din app
CREATE INDEX IF NOT EXISTS mese_user_created_idx ON mese(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mese_user_data_idx    ON mese(user_id, data DESC);
CREATE INDEX IF NOT EXISTS antrenamente_user_created_idx ON antrenamente(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_created_idx    ON audit_log(user_id, created_at DESC);

-- C4: aliniază plafoanele DB cu backendul (10000 kcal) + validează tot
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_calorii_check;
ALTER TABLE mese ADD  CONSTRAINT mese_calorii_check      CHECK (calorii      BETWEEN 0 AND 10000);
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_proteine_check;
ALTER TABLE mese ADD  CONSTRAINT mese_proteine_check     CHECK (proteine     BETWEEN 0 AND 1000);
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_grasimi_check;
ALTER TABLE mese ADD  CONSTRAINT mese_grasimi_check      CHECK (grasimi      BETWEEN 0 AND 1000);
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_carbohidrati_check;
ALTER TABLE mese ADD  CONSTRAINT mese_carbohidrati_check CHECK (carbohidrati BETWEEN 0 AND 2000);
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_fibre_check;
ALTER TABLE mese ADD  CONSTRAINT mese_fibre_check        CHECK (fibre        BETWEEN 0 AND 500);
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_tip_masa_check;
ALTER TABLE mese ADD  CONSTRAINT mese_tip_masa_check
  CHECK (tip_masa IS NULL OR tip_masa IN ('mic_dejun','pranz','cina','gustare'));

-- validare shape JSONB alimente (prinde exact bug-ul 2.5)
ALTER TABLE mese DROP CONSTRAINT IF EXISTS mese_alimente_shape_check;
ALTER TABLE mese ADD  CONSTRAINT mese_alimente_shape_check CHECK (
  jsonb_typeof(alimente) = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(alimente) e
     WHERE NOT (e ? 'nume' AND e ? 'calorii')
  )
);

-- C7: unifică coloanele duplicate din produse_camara
UPDATE produse_camara SET kcal_100g = calorii_100g
 WHERE kcal_100g IS NULL AND calorii_100g IS NOT NULL AND calorii_100g > 0;
COMMENT ON COLUMN produse_camara.calorii_100g IS 'DEPRECAT — folosește kcal_100g';

-- C9: un set trebuie să aibă cel puțin o metrică
ALTER TABLE workout_logs DROP CONSTRAINT IF EXISTS valid_metrics;
ALTER TABLE workout_logs ADD  CONSTRAINT valid_metrics CHECK (
  (reps IS NULL OR reps > 0) AND
  (weight_kg IS NULL OR weight_kg > 0) AND
  (time_seconds IS NULL OR time_seconds > 0) AND
  (reps IS NOT NULL OR time_seconds IS NOT NULL)
);

-- C10: politici moderne
DROP POLICY IF EXISTS "Authenticated users can read exercises" ON exercitii;
CREATE POLICY "Authenticated users can read exercises" ON exercitii
  FOR SELECT TO authenticated USING (true);

-- RLS pe tabelele nou create
ALTER TABLE mese   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own meals" ON mese;
CREATE POLICY "Users can only access their own meals" ON mese
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
