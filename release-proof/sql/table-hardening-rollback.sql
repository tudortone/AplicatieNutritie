-- PROPOSAL ONLY. Restores the known insecure baseline; not an automatic rollback.
-- Separate approval required. Only valid immediately after the paired remedy without drift.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR
     (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('ai_jobs','credite_ai','credite_tranzactii')
        AND c.relowner = 'postgres'::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND c.relacl::text = '{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}') <> 3 THEN
    RAISE EXCEPTION 'Executor/ACL/owner/RLS drift';
  END IF;
END
$guard$;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ai_jobs TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.credite_ai TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.credite_tranzactii TO anon, authenticated;
COMMIT;
