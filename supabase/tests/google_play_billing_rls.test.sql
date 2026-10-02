begin;

select plan(10);

select has_table('public', 'google_play_subscriptions', 'subscription authority table exists');
select has_table('public', 'google_play_rtdn_events', 'RTDN dedupe table exists');
select row_security_active('public.google_play_subscriptions');
select row_security_active('public.google_play_rtdn_events');

set local role anon;
select throws_ok(
  $$ select purchase_token from public.google_play_subscriptions $$,
  '42501',
  null,
  'anon cannot read raw purchase tokens'
);
select throws_ok(
  $$ insert into public.google_play_rtdn_events(message_id, package_name, processing_status)
     values ('forbidden', 'com.totsrl.getflo', 'received') $$,
  '42501',
  null,
  'anon cannot insert RTDN events'
);

reset role;
set local role authenticated;
select throws_ok(
  $$ select purchase_token from public.google_play_subscriptions $$,
  '42501',
  null,
  'authenticated cannot read raw purchase tokens'
);
select throws_ok(
  $$ update public.google_play_subscriptions set is_entitled = true $$,
  '42501',
  null,
  'authenticated cannot forge entitlement'
);
select throws_ok(
  $$ delete from public.google_play_rtdn_events $$,
  '42501',
  null,
  'authenticated cannot delete RTDN evidence'
);
select throws_ok(
  $$ select public.claim_google_play_rtdn_event(
       'forbidden', now(), now(), 'com.totsrl.getflo', 1, repeat('a', 64)
     ) $$,
  '42501',
  null,
  'authenticated cannot execute service-only ownership RPCs'
);

reset role;
select * from finish();
rollback;
