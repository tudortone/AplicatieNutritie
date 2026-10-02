begin;

select plan(12);

select has_table('public', 'workout_templates', 'Workout V2 template table exists');
select row_security_active('public.workout_templates');
select has_index('public', 'workout_templates', 'idx_workout_templates_user_updated', 'user/update index exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.workout_templates'::regclass),
  'RLS is enabled'
);
select ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.workout_templates'::regclass
       and contype = 'f'
       and confrelid = 'auth.users'::regclass
       and confdeltype = 'c'
  ),
  'user ownership uses auth.users ON DELETE CASCADE'
);
select ok(
  not has_table_privilege('anon', 'public.workout_templates', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no Data API grants'
);
select ok(
  has_table_privilege('authenticated', 'public.workout_templates', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated has explicit CRUD grants'
);
select ok(
  has_table_privilege('service_role', 'public.workout_templates', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role retains required access'
);

set local role anon;
select throws_ok(
  $$ select id from public.workout_templates $$,
  '42501',
  null,
  'anonymous users cannot read workout templates'
);
select throws_ok(
  $$ insert into public.workout_templates(user_id, name) values (gen_random_uuid(), 'forbidden') $$,
  '42501',
  null,
  'anonymous users cannot create workout templates'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$ insert into public.workout_templates(user_id, name)
     values ('22222222-2222-2222-2222-222222222222', 'cross-account') $$,
  '42501',
  null,
  'authenticated users cannot create templates for another account'
);
select is_empty(
  $$ select id from public.workout_templates
     where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'authenticated users cannot read another account templates'
);

reset role;
select * from finish();
rollback;
