begin;

select plan(11);

select has_table('public', 'user_feedback', 'Private feedback inbox exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_feedback'::regclass),
  'RLS is enabled'
);
select ok(
  not has_table_privilege('anon', 'public.user_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no Data API table grants'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated has no direct Data API table grants'
);
select ok(
  has_table_privilege('service_role', 'public.user_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'backend service role has explicit access'
);
select ok(
  has_function_privilege('authenticated', 'public.submit_user_feedback(text)', 'EXECUTE'),
  'authenticated users can execute the scoped submit RPC'
);
select ok(
  not has_function_privilege('anon', 'public.submit_user_feedback(text)', 'EXECUTE'),
  'anonymous users cannot execute the submit RPC'
);

insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'feedback-test@test.local')
on conflict (id) do nothing;

set local role anon;
select throws_ok(
  $$ select id from public.user_feedback $$,
  '42501',
  null,
  'anonymous users cannot read feedback'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select throws_ok(
  $$ select id from public.user_feedback $$,
  '42501',
  null,
  'authenticated users cannot read feedback'
);
select results_eq(
  $$ select delivery_status from public.submit_user_feedback('pgTAP private inbox test') $$,
  $$ values ('not_configured'::text) $$,
  'authenticated users receive only their own persistence receipt'
);

reset role;
set local role service_role;
select lives_ok(
  $$ select id from public.user_feedback limit 1 $$,
  'service role retains owner/admin read access'
);

select * from finish();
rollback;
