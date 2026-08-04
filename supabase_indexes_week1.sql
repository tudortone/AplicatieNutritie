-- ==========================================
-- SĂPTĂMÂNA 1: OPȚIONALIZARE ȘI INDEXURI DB (P-4)
-- Rulați acest script în Supabase SQL Editor
-- ==========================================

-- 1. Indexuri pe tabela `mese` (utilizator + data pentru filtrare rapidă jurnal)
CREATE INDEX IF NOT EXISTS idx_mese_user_data ON public.mese (user_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_mese_user_created ON public.mese (user_id, created_at DESC);

-- 2. Indexuri pe tabela `jurnal_exercitii`
CREATE INDEX IF NOT EXISTS idx_jurnal_exercitii_user_data ON public.jurnal_exercitii (user_id, data DESC);

-- 3. Index pe tabela de produse de coduri de bare / cache alimente
CREATE INDEX IF NOT EXISTS idx_produse_scana_barcode ON public.produse_scanate (barcode);

-- 4. Index pe tabela `retete_salvate` sau `favorite`
CREATE INDEX IF NOT EXISTS idx_retete_user_id ON public.retete_salvate (user_id);

-- 5. Index pe tabela `clerk_user_map` pentru identificare rapidă (C4)
CREATE INDEX IF NOT EXISTS idx_clerk_user_map_clerk_id ON public.clerk_user_map (clerk_user_id);
