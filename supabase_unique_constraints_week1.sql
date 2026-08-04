-- ==========================================
-- SĂPTĂMÂNA 1: CONSTRÂNGERI UNICE DB (S-3) — TOCTOU FIX
-- Rulați acest script în Supabase SQL Editor
-- ==========================================

-- 1. Asigurare constrângere unică pe `barcode` în produse_scanate / cache global alimente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_produse_scanate_barcode'
    ) THEN
        ALTER TABLE public.produse_scanate 
        ADD CONSTRAINT uq_produse_scanate_barcode UNIQUE (barcode);
    END IF;
END $$;

-- 2. Constrângere unică pe `clerk_user_id` în clerk_user_map pentru prevenirea mapărilor duble
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_clerk_user_map_clerk_id'
    ) THEN
        ALTER TABLE public.clerk_user_map 
        ADD CONSTRAINT uq_clerk_user_map_clerk_id UNIQUE (clerk_user_id);
    END IF;
END $$;
