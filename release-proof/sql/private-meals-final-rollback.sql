-- REVIEW PROPOSAL ONLY. Restores insecure captured ACL; never automatic.
-- Exact immediate post-remedy state required; does not bypass RLS or alter service_role.
BEGIN;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='1s';
DO $$ BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17
     OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.mese'::regclass
       AND relkind='r' AND relowner='postgres'::regrole
       AND relrowsecurity AND NOT relforcerowsecurity
       AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}') THEN
    RAISE EXCEPTION 'Meal rollback executor/version/ACL/owner/RLS drift';
  END IF;
END $$;
-- Restore original aclitem ordering too; transactional, same grantor, no CASCADE.
REVOKE ALL ON TABLE public.mese FROM authenticated,service_role;
GRANT ALL ON TABLE public.mese TO anon,authenticated,service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_class WHERE oid='public.mese'::regclass
      AND relacl::text='{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}') THEN
    RAISE EXCEPTION 'Meal rollback did not restore exact captured ACL';
  END IF;
END $$;
COMMIT;
