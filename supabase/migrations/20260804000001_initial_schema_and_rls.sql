-- ==============================================================================
-- NUTRIAI MIGRATION 001: INITIAL SCHEMA & RLS POLICIES (Idempotent)
-- ==============================================================================

-- 1. TABELA MESE
CREATE TABLE IF NOT EXISTS public.mese (
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
  data          DATE,
  ora           TIME,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mese ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own meals" ON public.mese;
CREATE POLICY "Users can only access their own meals" ON public.mese
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. TABELA PROFIL
CREATE TABLE IF NOT EXISTS public.profil (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nume TEXT,
  varsta INTEGER,
  greutate NUMERIC,
  inaltime NUMERIC,
  sex TEXT,
  activitate TEXT,
  obiectiv TEXT,
  calorii_tinta INTEGER,
  proteine_tinta INTEGER,
  grasimi_tinta INTEGER,
  carbi_tinta INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own profile" ON public.profil;
CREATE POLICY "Users can only access their own profile" ON public.profil
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. TABELA AUDIT LOG
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_log;
CREATE POLICY "Users can insert their own audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own audit logs" ON public.audit_log;
CREATE POLICY "Users can view their own audit logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. TABELA ANTRENAMENTE
CREATE TABLE IF NOT EXISTS public.antrenamente (
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

ALTER TABLE public.antrenamente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their own workouts" ON public.antrenamente;
CREATE POLICY "Users can access their own workouts" ON public.antrenamente
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
