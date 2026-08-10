-- =============================================================================
-- H2: `mese.imagine_url` lipsea din migrări (există doar în prod, aplicat manual).
-- Frontendul scrie/citește coloana (AddMealBottomSheet.tsx, MasaCard.tsx) cu
-- fallback care o abandonează la PGRST204 — pe un mediu nou pozele nu persistau.
-- =============================================================================
ALTER TABLE public.mese ADD COLUMN IF NOT EXISTS imagine_url TEXT;
