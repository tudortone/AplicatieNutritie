-- =============================================================================
-- FIX P-20: trg_mese_updated_at atasat pe o coloana inexistenta (updated_at pe mese)
-- =============================================================================
-- Context:
--   20260807000001 (P-20) a atasat trigger-ul BEFORE UPDATE `set_updated_at()`
--   pe `ai_jobs`, `profil` si `mese`. `ai_jobs` si `profil` AU coloana
--   `updated_at`; `mese` NU o are (de acolo doar `created_at`).
--   Consecinta: ORICARE UPDATE pe un rand real din `mese` starneste
--   `set_updated_at()` -> `NEW.updated_at = NOW()` si esueaza cu
--       record "new" has no field "updated_at"
--   Este un bug live (de la aplicarea acelei migrari) si opreste jobul CI
--   `rls-integration` la controlul negativ (UPDATE fara SET LOCAL ROLE), care
--   e singurul test ce love-ga de fapt 1 rand si starneste trigger-ul. Testele
--   RLS trec pentru ca UPDATE-urile lor (sub `authenticated`) matcheaza 0 randuri,
--   deci triggerul nu se activeaza niciodata.
--
-- Fix (ambele idempotente):
--   1) `set_updated_at()` devine column-aware: seteaza `NEW.updated_at` DOAR daca
--      tabela declansatoare are coloana `updated_at` (prin TG_TABLE_NAME).
--      ai_jobs/profil/credite_ai pastreaza comportamentul (au coloana); orice
--      trigger atarnat din greseala unei tabele fara `updated_at` devine no-op
--      (nu eroare). Aceasta este apararea in adancime.
--   2) `DROP TRIGGER trg_mese_updated_at` : `mese` nu are `updated_at`, deci
--      triggerul de aici este o greseala si trebuie eliminat, nu doar dezactivat.
--
-- Rulare: CI aplica global toate migrarile in ordine; pe prod se ruleaza ca
-- orice migrare noua.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA
      AND table_name   = TG_TABLE_NAME
      AND column_name  = 'updated_at'
  ) THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mese_updated_at ON public.mese;

-- NOTIFY PostgREST sa reincarce schema
NOTIFY pgrst, 'reload schema';