-- Focused pgTAP validation for 20260927090000_security_advisor_remediation.sql.
-- Run after migrations with `supabase test db`. Read-only privilege assertions
-- are safe on live state; function behavior remains covered by existing domain
-- tests to avoid creating production credit/GDPR side effects.

begin;
set local search_path = public, extensions, pg_catalog;
select plan(20);

select is(
  (select proconfig::text from pg_proc where oid = 'public.mese_set_local_day()'::regprocedure),
  '{search_path=""}',
  'mese_set_local_day has empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid = 'public.alimente_valid_shape(jsonb)'::regprocedure),
  '{search_path=""}',
  'alimente_valid_shape has empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid = 'public.set_updated_at()'::regprocedure),
  '{search_path=""}',
  'set_updated_at has empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid = 'public.sincronizeaza_gamificare_sigur()'::regprocedure),
  '{search_path=""}',
  'gamification RPC has empty search_path'
);

select is(
  (select proconfig::text from pg_proc where oid = 'public.aplica_tranzactie_credite(uuid,text,text,integer,text,jsonb)'::regprocedure),
  '{search_path=""}',
  'Flow Credit RPC has empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid = 'public.get_auth_user_by_email(text)'::regprocedure),
  '{search_path=""}',
  'identity lookup RPC has empty search_path'
);
select is(
  (select proconfig::text from pg_proc where oid = 'public.initiate_gdpr_deletion(uuid,text)'::regprocedure),
  '{search_path=""}',
  'GDPR RPC has empty search_path'
);

select ok(not has_function_privilege('anon', 'public.aplica_tranzactie_credite(uuid,text,text,integer,text,jsonb)', 'EXECUTE'), 'anon cannot mutate Flow Credits');
select ok(not has_function_privilege('authenticated', 'public.aplica_tranzactie_credite(uuid,text,text,integer,text,jsonb)', 'EXECUTE'), 'authenticated cannot mutate Flow Credits');
select ok(has_function_privilege('service_role', 'public.aplica_tranzactie_credite(uuid,text,text,integer,text,jsonb)', 'EXECUTE'), 'service_role can mutate Flow Credits');

select ok(not has_function_privilege('anon', 'public.get_auth_user_by_email(text)', 'EXECUTE'), 'anon cannot inspect auth users');
select ok(not has_function_privilege('authenticated', 'public.get_auth_user_by_email(text)', 'EXECUTE'), 'authenticated cannot inspect auth users');
select ok(has_function_privilege('service_role', 'public.get_auth_user_by_email(text)', 'EXECUTE'), 'service_role can inspect auth users');

select ok(not has_function_privilege('anon', 'public.initiate_gdpr_deletion(uuid,text)', 'EXECUTE'), 'anon cannot initiate GDPR deletion');
select ok(not has_function_privilege('authenticated', 'public.initiate_gdpr_deletion(uuid,text)', 'EXECUTE'), 'authenticated cannot target GDPR deletion');
select ok(has_function_privilege('service_role', 'public.initiate_gdpr_deletion(uuid,text)', 'EXECUTE'), 'service_role can initiate GDPR deletion');

select ok(not has_function_privilege('anon', 'public.sincronizeaza_gamificare_sigur()', 'EXECUTE'), 'anon cannot synchronize gamification');
select ok(has_function_privilege('authenticated', 'public.sincronizeaza_gamificare_sigur()', 'EXECUTE'), 'authenticated can synchronize own gamification');
select ok(has_function_privilege('service_role', 'public.sincronizeaza_gamificare_sigur()', 'EXECUTE'), 'service_role retains operational access');

select is(
  (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.sincronizeaza_gamificare_sigur()'::regprocedure),
  'postgres',
  'security definer owner remains postgres'
);

select * from finish();
rollback;
