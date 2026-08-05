-- ==============================================================================
-- NUTRIAI — TTL FIZIC PE BARCODE_CACHE, 2026-08 (D3)
--
-- Idempotenta: poate fi rulata de mai multe ori fara efecte secundare.
-- Rulare: SQL Editor din dashboard-ul Supabase, SAU `supabase db push`.
--
-- Context:
--  - `barcode_cache` creste fara limita: intrarea expirata era tratata DOAR
--    logic, in JS (`citesteDinCacheGlobal` din utils/barcode.js respinge
--    randurile mai vechi de TTL_CACHE_MS), dar randul ramanea fizic in tabela.
--  - Aceasta migrare adauga curatarea FIZICA: o functie `curata_barcode_cache_vechi`
--    (modelata pe `curata_audit_log_vechi` din 20260805000001_gdpr_complete) +
--    index pe `updated_at` + programare zilnica prin pg_cron (daca e disponibil).
--  - TTL logic din JS ramane: el e prima linie de aparare (raspuns corect chiar
--    daca cron-ul nu ruleaza); curatarea fizica de aici doar elibereaza spatiul.
-- ==============================================================================


-- ==============================================================================
-- 1. INDEX PE TIMP
--    Indexul `barcode_cache_updated_at_idx` din scriptul radacina
--    `supabase_rls_policies.sql` devine redundant cu acesta si poate fi
--    eliminat la consolidarea B-19.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_barcode_cache_updated_at
  ON public.barcode_cache (updated_at);


-- ==============================================================================
-- 2. FUNCTIA DE CURATARE
--    Sterge randurile mai vechi de `p_vreme_zile` zile. Randurile fara
--    `updated_at` (legacy, dinaintea coloanei) sunt tratate ca vechi: JS-ul
--    le respinge deja in `citesteDinCacheGlobal` (`new Date(null)` = NaN,
--    nu un TTL valid), deci eliminarea lor nu pierde nimic accesibil.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.curata_barcode_cache_vechi(p_vreme_zile integer DEFAULT 30)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  delete from public.barcode_cache
   where updated_at is null
      or updated_at < now() - make_interval(days => p_vreme_zile);
$$;


-- ==============================================================================
-- 3. PROGRAMARE ZILNICA A CURATARII (daca pg_cron este disponibil).
--    Pe planurile care nu permit pg_cron, `cron.schedule` este ignorat si
--    curatarea poate fi apelata manual: `select public.curata_barcode_cache_vechi();`
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    PERFORM cron.schedule(
      'nutriai-curata-barcode-cache',
      '0 4 * * *',          -- zilnic la 04:00 (ora bazei de date)
      $sql$select public.curata_barcode_cache_vechi(30);$sql$
    );
  END IF;
END $$;

-- NOTIFY PostgREST sa reincarce schema
NOTIFY pgrst, 'reload schema';
