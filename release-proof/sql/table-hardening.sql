-- PROPOSAL ONLY. Requires separate Production approval and fresh catalog validation.
-- Run as postgres with ON_ERROR_STOP. No rows, policies, functions or managed defaults change.
BEGIN;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17 THEN
    RAISE EXCEPTION 'Unexpected executor or PostgreSQL major';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('ai_jobs','credite_ai','credite_tranzactii')
        AND c.relkind = 'r' AND c.relowner = 'postgres'::regrole AND c.relrowsecurity
        AND NOT c.relforcerowsecurity
        AND c.relacl::text = '{postgres=arwdDxtm/postgres,anon=rDxtm/postgres,authenticated=rDxtm/postgres,service_role=arwdDxtm/postgres}') <> 3 THEN
    RAISE EXCEPTION 'ACL/owner/RLS drift: do not adapt automatically';
  END IF;
END
$guard$;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ai_jobs FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.credite_ai FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.credite_tranzactii FROM anon, authenticated;
DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated')) r(role_name)
      CROSS JOIN (VALUES ('public.ai_jobs'),('public.credite_ai'),('public.credite_tranzactii')) t(table_name)
      CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege_name)
      WHERE has_table_privilege(r.role_name,t.table_name,p.privilege_name)) THEN
    RAISE EXCEPTION 'Effective privilege remains: transaction must roll back';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('ai_jobs','credite_ai','credite_tranzactii')
        AND c.relacl::text = '{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}') <> 3 THEN
    RAISE EXCEPTION 'Unexpected final ACL: transaction must roll back';
  END IF;
END
$verify$;
COMMIT;
