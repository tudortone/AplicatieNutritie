-- REVIEW PROPOSAL ONLY. Fresh Hosted metadata and explicit Production approval required.
-- Supersedes the anon-only meal proposal; retains authenticated CRUD and all service rights.
BEGIN;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='1s';
DO $$ BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17
     OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.mese'::regclass
       AND relkind='r' AND relowner='postgres'::regrole
       AND relrowsecurity AND NOT relforcerowsecurity
       AND relacl::text='{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}') THEN
    RAISE EXCEPTION 'Meal executor/version/ACL/owner/RLS drift';
  END IF;
END $$;
REVOKE ALL ON TABLE public.mese FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.mese FROM authenticated;
DO $$ BEGIN
  IF has_table_privilege('anon','public.mese','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR EXISTS (SELECT FROM unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
       WHERE has_table_privilege('authenticated','public.mese',p))
     OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.mese'::regclass
       AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}') THEN
    RAISE EXCEPTION 'Unexpected effective meal rights or preserved ACL';
  END IF;
END $$;
COMMIT;
