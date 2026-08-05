-- ==============================================================================
-- NUTRIAI — FOLD SCRIPTURI RĂDĂCINĂ (D-1)
-- ==============================================================================
-- Consolidează într-o singură migrare numerotată conținutul celor 5 scripturi
-- SQL orfane din rădăcina repo-ului care NU exista deja în migrările numerotate:
--   supabase_indexes_week1.sql
--   supabase_migration_fix.sql
--   supabase_patch_critic.sql
--   supabase_rls_policies.sql
--   supabase_unique_constraints_week1.sql
-- (fișierele au fost șterse după acest fold — vezi commit-ul D-1).
--
-- Idempotentă: toate comenzile folosesc IF NOT EXISTS / DROP IF EXISTS /
-- CREATE OR REPLACE, deci poate fi rulată de mai multe ori.
--
-- ORDONARE / NUMEROTARE:
-- Versiunea 20260804000003000 (precizie de milisecunde) sortează ÎNTRE
-- migrările 003 (20260804000003) și audit_critic (20260804000004). Este singura
-- poziție care asigură ca `barcode_cache.payload` — cerut de INSERT-ul din
-- audit_critic — să existe ÎNAINTE de audit_critic, fără a muta audit_critic
-- de pe 004 (D-2: redenumire păstrează ordinea relativă).
--
-- CONFLICTE REZOLVATE (canonicul rămâne în migrările numerotate, NU se reintroduce):
--  * mese.fibre: rls_policies zice `INTEGER DEFAULT 0`, migrarea 001 zice
--    `NUMERIC NOT NULL DEFAULT 0`. Canonic = 001 (NUMERIC). Fold-ul nu adaugă
--    coloana, deci tipul din 001 rămâne.
--  * mese CHECK calorii/proteine/grasimi/carbohidrati: rls_policies folosea
--    limite 15000/2000/2000/2000, migrarea 003 folosește 10000/1000/1000/2000.
--    Canonic = 003. Fold-ul adaugă DOAR mese_fibre_check, mese_tip_masa_check,
--    mese_alimente_shape_check (care nu existau nicăieri).
--  * idx_jurnal_exercitii_user_data / idx_produse_scana_barcode: rădăcina le
--    crea pe tabelele `jurnal_exercitii`/`produse_scanate` (inexistente în
--    schemă); migrarea 003 are ACEEAȘI nume pe `antrenamente`/`barcode_cache`.
--    Canonic = 003; versiunea din rădăcină nu se pliază.
--  * idx_retete_user_id / uq_produse_scanate_barcode / idx_clerk_user_map_clerk_id:
--    țintesc tabele inexistente sau sunt redundanți (clerk_user_id e PRIMARY KEY
--    în 002, plus uq_clerk_user_map_clerk_id în 003) — nu se pliază.
--  * indexurile mese_user_id_idx / mese_user_created_idx / mese_user_data_idx /
--    antrenamente_user_created_idx sunt acoperite de compușii din migrarea 003
--    (idx_mese_user_data, idx_mese_user_created, idx_jurnal_exercitii_user_data
--    pe antrenamente) — regula coloanei conducătoare user_id. Nu se pliază.
--  * barcode_cache_updated_at_idx devine redundant cu idx_barcode_cache_updated_at
--    din migrarea TTL — nu se pliază.
-- ==============================================================================


-- ==============================================================================
-- 1. [PATCH-CRITIC] barcode_cache.payload — exista DOAR în rls_policies; migrarea
--    002 creează barcode_cache fără payload, dar audit_critic face INSERT cu
--    payload. Coloana trebuie să existe înainte de audit_critic (vezi numerotarea).
-- ==============================================================================
ALTER TABLE public.barcode_cache ADD COLUMN IF NOT EXISTS payload JSONB;

-- ==============================================================================
-- 2. [PATCH-CRITIC] Backfill is_system + curățare estimări AI din cache-ul
--    global. Estimările AI per utilizator trăiesc în barcode_estimari_utilizator.
-- ==============================================================================
UPDATE public.barcode_cache
   SET is_system = true
 WHERE source IN ('openfoodfacts', 'off', 'estimare_ai');
DELETE FROM public.barcode_cache WHERE source = 'estimare_ai';

-- ==============================================================================
-- 3. [MIGRATION_FIX] mese.data/ora — coloanele + backfill din created_at (ziua
--    locală). Migrarea 001 le creează pe schema nouă, dar pe o bază care a primit
--    doar scripturile vechi (mese din patch_critic C1, fără data/ora) coloanele
--    lipsesc — ADD COLUMN IF NOT EXISTS acoperă ambele cazuri, backfill-ul umple.
-- ==============================================================================
ALTER TABLE public.mese ADD COLUMN IF NOT EXISTS data DATE;
ALTER TABLE public.mese ADD COLUMN IF NOT EXISTS ora  TIME;

UPDATE public.mese
   SET data = (created_at AT TIME ZONE 'Europe/Bucharest')::date,
       ora  = (created_at AT TIME ZONE 'Europe/Bucharest')::time
 WHERE data IS NULL;

-- ==============================================================================
-- 4. [MIGRATION_FIX] Ziua locală stocată explicit: trigger la INSERT pe mese.
--    Fără el, mesele noi ar rămâne fără data/ora până la o actualizare.
-- ==============================================================================
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

DROP TRIGGER IF EXISTS trg_mese_local_day ON public.mese;
CREATE TRIGGER trg_mese_local_day BEFORE INSERT ON public.mese
  FOR EACH ROW EXECUTE FUNCTION mese_set_local_day();

-- ==============================================================================
-- 5. [MIGRATION_FIX] mese — coloanele pentru CHECK-uri + CHECK-urile care nu
--    erau în nicio migrare numerotată. Pe bazele vechi coloanele pot lipsi (la
--    fel ca data/ora din secțiunea 3), deci ADD COLUMN IF NOT EXISTS le adaugă
--    cu tipurile canonice din 001; pe replay curat e no-op.
--    (Calorii/proteine/grasimi/carbohidrati sunt deja în 003 — nu se repetă.)
-- ==============================================================================
ALTER TABLE public.mese ADD COLUMN IF NOT EXISTS fibre    NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.mese ADD COLUMN IF NOT EXISTS tip_masa TEXT;
ALTER TABLE public.mese ADD COLUMN IF NOT EXISTS alimente JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_fibre_check;
ALTER TABLE public.mese ADD  CONSTRAINT mese_fibre_check CHECK (fibre BETWEEN 0 AND 500);

ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_tip_masa_check;
ALTER TABLE public.mese ADD  CONSTRAINT mese_tip_masa_check
  CHECK (tip_masa IS NULL OR tip_masa IN ('mic_dejun','pranz','cina','gustare'));

ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_alimente_shape_check;
ALTER TABLE public.mese ADD  CONSTRAINT mese_alimente_shape_check CHECK (
  jsonb_typeof(alimente) = 'array' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(alimente) e
     WHERE NOT (e ? 'nume' AND e ? 'calorii')
  )
);

-- ==============================================================================
-- 6. [MIGRATION_FIX / RLS_POLICIES] Index pe audit_log (user_id, created_at DESC)
--    — singurul index pe audit_log cu user_id (migrarea gdpr are doar created_at).
-- ==============================================================================
CREATE INDEX IF NOT EXISTS audit_log_user_created_idx ON public.audit_log(user_id, created_at DESC);

-- ==============================================================================
-- 7. [RLS_POLICIES] produse_camara — tabelă care exista DOAR în scriptul rădăcină.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.produse_camara (
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

-- Extindere catalog personal & introducere manuală (B6) + tracking avansat cămară
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS kcal_100g NUMERIC;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS fibre_100g NUMERIC;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS portie_label TEXT;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS portie_grame NUMERIC;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS cantitate NUMERIC DEFAULT 1;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS cantitate_g NUMERIC;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS data_expirare DATE;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS zile_valabilitate INTEGER;
ALTER TABLE public.produse_camara ADD COLUMN IF NOT EXISTS is_congelat BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS produse_camara_user_id_idx ON public.produse_camara(user_id);
CREATE INDEX IF NOT EXISTS produse_camara_lower_nume_idx ON public.produse_camara(LOWER(nume));
CREATE INDEX IF NOT EXISTS produse_camara_barcode_idx ON public.produse_camara(barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.produse_camara ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own pantry products" ON public.produse_camara;
CREATE POLICY "Users can access their own pantry products" ON public.produse_camara
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- [MIGRATION_FIX] Unifică coloanele duplicate kcal_100g/calorii_100g
UPDATE public.produse_camara SET kcal_100g = calorii_100g
 WHERE kcal_100g IS NULL AND calorii_100g IS NOT NULL AND calorii_100g > 0;
COMMENT ON COLUMN public.produse_camara.calorii_100g IS 'DEPRECAT — folosește kcal_100g';

-- ==============================================================================
-- 8. [RLS_POLICIES] antrenamente — coloane de extindere care nu erau în migrarea 001.
-- ==============================================================================
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS muscle_load JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS external_volume_kg NUMERIC DEFAULT 0;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS equivalent_volume_kg NUMERIC;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS session_score INTEGER;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS rank_key TEXT;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS rank_label TEXT;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS calculation_version INTEGER DEFAULT 1;
ALTER TABLE public.antrenamente ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ==============================================================================
-- 9. [RLS_POLICIES] gamificare — tabelă care exista DOAR în scriptul rădăcină.
--    UNIQUE inline pe user_id creează deja indexul gamificare_user_id_key;
--    dedup-ul + CREATE UNIQUE INDEX IF NOT EXISTS acoperă bazele cu duplicate.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gamificare (
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

CREATE INDEX IF NOT EXISTS gamificare_user_id_idx ON public.gamificare(user_id);
CREATE INDEX IF NOT EXISTS gamificare_user_updated_idx ON public.gamificare(user_id, updated_at DESC);

ALTER TABLE public.gamificare ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own gamification" ON public.gamificare;
CREATE POLICY "Users can manage their own gamification" ON public.gamificare
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- upsert-ul `.upsert({...}, { onConflict: 'user_id' })` are nevoie de UNIQUE(user_id)
DELETE FROM public.gamificare g USING public.gamificare g2
  WHERE g.user_id = g2.user_id AND g.ctid < g2.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS gamificare_user_id_key ON public.gamificare(user_id);

-- ==============================================================================
-- 10. [RLS_POLICIES] exercises + workout_logs — fitness adaptiv, existau DOAR în
--     scriptul rădăcină. workout_logs primește direct valid_metrics ÎNTĂRIT
--     (clauza suplimentară din migration_fix C9: un set trebuie să aibă cel puțin
--     o metrică), ca stare finală — constraint-ul de bază din rls_policies este
--     acoperit de acesta.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  equipment text NOT NULL CHECK (equipment IN ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','band')),
  target_muscles text[] NOT NULL,
  input_type text NOT NULL CHECK (input_type IN ('hold','bodyweight_reps','weighted_reps')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read exercises catalog" ON public.exercises;
CREATE POLICY "Anyone can read exercises catalog" ON public.exercises
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  set_index int NOT NULL,
  reps int,
  weight_kg numeric(6,2),
  time_seconds int,
  CONSTRAINT valid_metrics CHECK (
    (reps IS NULL OR reps > 0) AND
    (weight_kg IS NULL OR weight_kg > 0) AND
    (time_seconds IS NULL OR time_seconds > 0) AND
    (reps IS NOT NULL OR time_seconds IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON public.workout_logs(user_id, performed_at DESC);

ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own workout logs" ON public.workout_logs;
CREATE POLICY "Users can manage their own workout logs" ON public.workout_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 11. [RLS_POLICIES] exercitii — catalog partajat, read-only pentru utilizatori.
--     Politica folosește clauza TO authenticated (auth.role() e deprecat).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.exercitii (
  id TEXT PRIMARY KEY,
  nume TEXT NOT NULL,
  categorie TEXT NOT NULL,
  grupe TEXT[] DEFAULT '{}',
  dificultate TEXT DEFAULT 'mediu',
  echipament TEXT DEFAULT 'greutate corporală',
  met NUMERIC DEFAULT 5,
  calorii_pe_minut NUMERIC DEFAULT 7,
  serii_default INTEGER DEFAULT 3,
  repetari_default INTEGER DEFAULT 10,
  muschi_tinta JSONB DEFAULT '{}',
  descriere TEXT,
  instructiuni TEXT[],
  greseli_comune TEXT[],
  sfaturi TEXT[],
  masurare JSONB,
  muscle_activations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exercitii ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read exercises" ON public.exercitii;
CREATE POLICY "Authenticated users can read exercises" ON public.exercitii
  FOR SELECT
  TO authenticated
  USING (true);

-- ==============================================================================
-- 12. NOTIFY PostgREST să reîncarce schema (tabele + coloane noi)
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
