-- ==============================================================================
-- NUTRIAI — MIGRARE GDPR COMPLET, 2026-08 (B-12)
--
-- Idempotenta: poate fi rulata de mai multe ori fara efecte secundare.
-- Rulare: SQL Editor din dashboard-ul Supabase, SAU `supabase db push`.
--
-- Context:
--  - Tabelele cu date de utilizator au deja `user_id REFERENCES auth.users(id)
--    ON DELETE CASCADE` (migrarile 001/002). De aceea stergerea contului se
--    rezolva prin stergerea randului din `auth.users` (auth.admin.deleteUser),
--    care curata in cascada toate tabelele fara a lasa randuri orfane.
--  - Aceasta migrare adauga:
--      1) re-afirmarea idempotenta a cascadelor (aparare in adancime),
--      2) politica de retentie pe `audit_log`,
--      3) un index de timp pe `audit_log` pentru o stergere eficienta.
-- ==============================================================================


-- ==============================================================================
-- 1. RE-AFIRMARE CASCADE (idempotenta) pe toate tabelele cu date de utilizator.
--    Dropping + re-add constraint este sigur daca constrangerea exista deja
--    (DROP IF EXISTS). Nu se pierd date: doar se reface regula de cascada.
-- ==============================================================================

-- Re-afirmam explicit regula pentru fiecare tabela util (idempotent).
ALTER TABLE public.mese
  DROP CONSTRAINT IF EXISTS mese_user_id_fkey;
ALTER TABLE public.mese
  ADD CONSTRAINT mese_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profil
  DROP CONSTRAINT IF EXISTS profil_user_id_fkey;
ALTER TABLE public.profil
  ADD CONSTRAINT profil_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.antrenamente
  DROP CONSTRAINT IF EXISTS antrenamente_user_id_fkey;
ALTER TABLE public.antrenamente
  ADD CONSTRAINT antrenamente_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.barcode_estimari_utilizator
  DROP CONSTRAINT IF EXISTS barcode_estimari_utilizator_user_id_fkey;
ALTER TABLE public.barcode_estimari_utilizator
  ADD CONSTRAINT barcode_estimari_utilizator_user_id_fkey FOREIGN KEY (user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.clerk_user_map
  DROP CONSTRAINT IF EXISTS clerk_user_map_supabase_user_id_fkey;
ALTER TABLE public.clerk_user_map
  ADD CONSTRAINT clerk_user_map_supabase_user_id_fkey FOREIGN KEY (supabase_user_id)
  REFERENCES auth.users(id) ON DELETE CASCADE;


-- ==============================================================================
-- 2. POLITICA DE RETENTIE PE AUDIT_LOG (GDPR: date minimale, timp minim).
--    Creeaza o functie de curatare idempotenta si un index de timp.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at);

CREATE OR REPLACE FUNCTION public.curata_audit_log_vechi(p_vreme_zile integer DEFAULT 90)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  delete from public.audit_log
   where created_at < now() - make_interval(days => p_vreme_zile);
$$;


-- ==============================================================================
-- 3. PROGRAMARE ZILNICA A CURATARII (daca pg_cron este disponibil).
--    Pe planurile care nu permit pg_cron, `cron.schedule` este ignorat si
--    curatarea poate fi apelata manual: `select public.curata_audit_log_vechi();`
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'nutriai-curata-audit-log',
      '0 3 * * *',          -- zilnic la 03:00 (ora bazei de date)
      $sql$select public.curata_audit_log_vechi(90);$sql$
    );
  END IF;
END $$;

-- NOTIFY PostgREST sa reincarce schema
NOTIFY pgrst, 'reload schema';