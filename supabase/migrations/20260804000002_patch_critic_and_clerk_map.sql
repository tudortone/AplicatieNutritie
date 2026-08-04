-- ==============================================================================
-- NUTRIAI MIGRATION 002: CLERK USER MAP & BARCODE ESTIMARI (Idempotent)
-- ==============================================================================

-- 1. CLERK USER MAP
CREATE TABLE IF NOT EXISTS public.clerk_user_map (
  clerk_user_id   TEXT PRIMARY KEY,
  supabase_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clerk_user_map_supabase_idx
  ON public.clerk_user_map (supabase_user_id);

ALTER TABLE public.clerk_user_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend-only access for clerk_user_map" ON public.clerk_user_map;
CREATE POLICY "Backend-only access for clerk_user_map" ON public.clerk_user_map
  FOR ALL USING (false);

-- 2. BARCODE CACHE
CREATE TABLE IF NOT EXISTS public.barcode_cache (
  code         TEXT PRIMARY KEY,
  name         TEXT,
  brand        TEXT,
  quantity     TEXT,
  kcal_100g    NUMERIC,
  protein_100g NUMERIC,
  carbs_100g   NUMERIC,
  fat_100g     NUMERIC,
  source       TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  created_by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.barcode_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend-only access for barcode_cache" ON public.barcode_cache;
CREATE POLICY "Backend-only access for barcode_cache" ON public.barcode_cache
  FOR ALL USING (false);

-- 3. BARCODE ESTIMARI PER UTILIZATOR
CREATE TABLE IF NOT EXISTS public.barcode_estimari_utilizator (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT,
  brand        TEXT,
  quantity     TEXT,
  kcal_100g    NUMERIC,
  protein_100g NUMERIC,
  carbs_100g   NUMERIC,
  fat_100g     NUMERIC,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, code)
);

ALTER TABLE public.barcode_estimari_utilizator ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimari_proprii" ON public.barcode_estimari_utilizator;
CREATE POLICY "estimari_proprii"
  ON public.barcode_estimari_utilizator
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
