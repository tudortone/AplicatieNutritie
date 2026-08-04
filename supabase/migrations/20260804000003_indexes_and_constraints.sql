-- ==============================================================================
-- NUTRIAI MIGRATION 003: INDEXES, CONSTRAINTS & AUDIT TRAIL (Idempotent)
-- ==============================================================================

-- 1. INDEXURI OPTIMIZATE PE USER_ID SI CREATED_AT / DATA
CREATE INDEX IF NOT EXISTS idx_mese_user_data ON public.mese (user_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_mese_user_created ON public.mese (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jurnal_exercitii_user_data ON public.antrenamente (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_produse_scana_barcode ON public.barcode_cache (code);

-- 2. CONSTRÂNGERI UNICE PENTRU EMINAREA RACE CONDITIONS (TOCTOU)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_clerk_user_map_clerk_id'
    ) THEN
        ALTER TABLE public.clerk_user_map 
        ADD CONSTRAINT uq_clerk_user_map_clerk_id UNIQUE (clerk_user_id);
    END IF;
END $$;

-- 3. VALIDARI DE SANITATE DB (CHECK CONSTRAINTS)
ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_calorii_check;
ALTER TABLE public.mese ADD CONSTRAINT mese_calorii_check CHECK (calorii BETWEEN 0 AND 10000);

ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_proteine_check;
ALTER TABLE public.mese ADD CONSTRAINT mese_proteine_check CHECK (proteine BETWEEN 0 AND 1000);

ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_grasimi_check;
ALTER TABLE public.mese ADD CONSTRAINT mese_grasimi_check CHECK (grasimi BETWEEN 0 AND 1000);

ALTER TABLE public.mese DROP CONSTRAINT IF EXISTS mese_carbohidrati_check;
ALTER TABLE public.mese ADD CONSTRAINT mese_carbohidrati_check CHECK (carbohidrati BETWEEN 0 AND 2000);

-- NOTIFY PostgREST sa reincarce schema
NOTIFY pgrst, 'reload schema';
