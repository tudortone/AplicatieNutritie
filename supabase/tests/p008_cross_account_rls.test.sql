-- P0-08 — matricea de securitate cross-account, executata pe Postgres REAL.
--
-- Rulare (necesita Docker + Supabase local):
--   supabase start
--   supabase test db
--
-- Acest fisier acopera modelul de amenintare cu DOI utilizatori pentru tabelele
-- detinute de utilizator, plus accesul anonim si tabelele backend-only/facturare.
-- Testul static din backend-nutritie-ai/tests/p008_rls_schema_assurance.test.js
-- ruleaza mereu (si fara Docker), dar NU executa politici reale — acesta o face.

begin;
select plan(34);

-- ---------------------------------------------------------------- fixture
-- Doua identitati reale in auth.users.
insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user_a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'user_b@test.local')
on conflict (id) do nothing;

-- Randuri seminale, inserate cu privilegii de proprietar (inainte de SET ROLE).
insert into public.mese (id, user_id, nume, calorii, proteine, grasimi, carbohidrati, tip_masa)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Masa A', 100, 1, 1, 1, 'gustare'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Masa B', 200, 2, 2, 2, 'gustare')
on conflict (id) do nothing;

insert into public.profil (user_id, greutate) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 70),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 80)
on conflict (user_id) do nothing;

-- Helper: devine utilizatorul A / B exact ca PostgREST (rol + claim `sub`).
create or replace function pg_temp.devino(p_user uuid) returns void
language plpgsql as $$
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L', json_build_object('sub', p_user, 'role', 'authenticated')::text);
end; $$;

-- =========================================================== RLS ENABLEMENT
select row_security_active('public.mese');
select row_security_active('public.profil');
select row_security_active('public.antrenamente');
select row_security_active('public.produse_camara');
select row_security_active('public.workout_logs');
select row_security_active('public.barcode_estimari_utilizator');
select row_security_active('public.google_play_subscriptions');
select row_security_active('public.google_play_rtdn_events');

-- ============================================================ UTILIZATOR A
select pg_temp.devino('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- 1. A isi vede propriul rand
select is(
  (select count(*)::int from public.mese where id = '11111111-1111-4111-8111-111111111111'),
  1, 'A isi poate citi propria masa');

-- 2. A NU vede randul lui B
select is(
  (select count(*)::int from public.mese where id = '22222222-2222-4222-8222-222222222222'),
  0, 'A NU poate citi masa lui B');

-- 2b. Enumerarea completa nu scurge randuri straine
select is(
  (select count(*)::int from public.mese where user_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0, 'A nu vede niciun rand al altui utilizator prin select nefiltrat');

-- 3. A poate insera pe propriul user_id
select lives_ok(
  $$ insert into public.mese (user_id, nume, calorii, proteine, grasimi, carbohidrati, tip_masa)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Noua A', 10, 1, 1, 1, 'gustare') $$,
  'A poate insera o masa proprie');

-- 4. A NU poate insera un rand detinut de B (WITH CHECK)
select throws_ok(
  $$ insert into public.mese (user_id, nume, calorii, proteine, grasimi, carbohidrati, tip_masa)
     values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Fals B', 10, 1, 1, 1, 'gustare') $$,
  '42501', null, 'A NU poate insera o masa pe user_id-ul lui B');

-- 5. A isi poate actualiza propriul rand
select lives_ok(
  $$ update public.mese set calorii = 111
      where id = '11111111-1111-4111-8111-111111111111' $$,
  'A isi poate actualiza propria masa');

-- 6. A NU poate actualiza randul lui B (USING filtreaza => 0 randuri)
select is(
  (with u as (update public.mese set calorii = 999
               where id = '22222222-2222-4222-8222-222222222222' returning 1)
   select count(*)::int from u),
  0, 'A NU poate actualiza masa lui B');

-- 7. A NU poate muta proprietatea randului propriu catre B (WITH CHECK)
select throws_ok(
  $$ update public.mese set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'A NU poate reasigna propriul rand catre B');

-- 8/9. Stergere: proprie permisa, a lui B imposibila
select is(
  (with d as (delete from public.mese
               where id = '22222222-2222-4222-8222-222222222222' returning 1)
   select count(*)::int from d),
  0, 'A NU poate sterge masa lui B');

-- 13. UPSERT cross-user respins
select throws_ok(
  $$ insert into public.mese (id, user_id, nume, calorii, proteine, grasimi, carbohidrati, tip_masa)
     values ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Hijack',1,1,1,1,'gustare')
     on conflict (id) do update set nume = 'Hijack' $$,
  '42501', null, 'UPSERT cross-user este respins');

-- profil: acelasi model
select is(
  (select count(*)::int from public.profil where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  0, 'A NU poate citi profilul lui B');
select throws_ok(
  $$ update public.profil set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'A NU isi poate reasigna profilul catre B');

-- ============================================ FACTURARE / BACKEND-ONLY (A)
-- 15-18. Clientul autentificat nu atinge facturarea, nici macar pentru citire.
select throws_ok(
  $$ select purchase_token from public.google_play_subscriptions $$,
  '42501', null, 'autentificat NU poate citi purchase_token brut');
select throws_ok(
  $$ insert into public.google_play_subscriptions
       (purchase_token, purchase_token_hash, user_id, product_id, subscription_state,
        acknowledgement_state, verification_started_at)
     values (repeat('t',32), repeat('a',64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
             'premium.monthly','SUBSCRIPTION_STATE_ACTIVE','ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', now()) $$,
  '42501', null, 'autentificat NU poate INSERA o subscriptie (Premium forjat)');
select throws_ok(
  $$ update public.google_play_subscriptions set is_entitled = true $$,
  '42501', null, 'autentificat NU poate ACTUALIZA starea de entitlement');
select throws_ok(
  $$ delete from public.google_play_subscriptions $$,
  '42501', null, 'autentificat NU poate STERGE dovada achizitiei');

-- 19. Starea de deduplicare RTDN e inaccesibila clientului
select throws_ok(
  $$ update public.google_play_rtdn_events set processing_status = 'processed' $$,
  '42501', null, 'autentificat NU poate modifica starea RTDN');

-- Tabele strict interne
select throws_ok($$ select * from public.clerk_user_map $$, '42501', null,
  'autentificat NU poate citi clerk_user_map');
select throws_ok($$ select * from public.gdpr_deletions $$, '42501', null,
  'autentificat NU poate citi gdpr_deletions');
select throws_ok($$ select * from public.barcode_cache $$, '42501', null,
  'autentificat NU poate citi barcode_cache');

-- 29. RPC rezervat backendului nu poate fi invocat din client
select throws_ok(
  $$ select public.apply_google_play_acknowledgement_result('x', true, null, null) $$,
  '42501', null, 'autentificat NU poate invoca RPC-ul de facturare');

-- 14/30. Singurul RPC de client deriva identitatea din auth.uid(), nu din argument
select lives_ok(
  $$ select public.sincronizeaza_gamificare_sigur() $$,
  'RPC-ul de gamificare ruleaza pentru utilizatorul autentificat');
select is(
  (select count(*)::int from public.gamificare_evenimente
    where user_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0, 'RPC-ul de gamificare nu expune/creeaza evenimente pentru alt utilizator');

-- Scrierea directa in gamificare este revocata (autoritate server-side)
select throws_ok(
  $$ update public.gamificare set xp = 999999
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'autentificat NU isi poate falsifica XP-ul direct');

reset role;

-- ============================================================ UTILIZATOR B
select pg_temp.devino('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select is(
  (select count(*)::int from public.mese where id = '11111111-1111-4111-8111-111111111111'),
  0, 'B NU poate citi masa lui A (simetric)');
select is(
  (select calorii::int from public.mese where id = '22222222-2222-4222-8222-222222222222'),
  200, 'randul lui B a ramas neatins de incercarile lui A');

reset role;

-- ================================================================ ANONIM
select pg_temp.devino(null);
reset role;
set local role anon;

-- 10/11. Anonimul nu atinge date private
select is((select count(*)::int from public.mese), 0, 'anon nu vede nicio masa');
select is((select count(*)::int from public.profil), 0, 'anon nu vede niciun profil');
select throws_ok(
  $$ insert into public.mese (user_id, nume, calorii, proteine, grasimi, carbohidrati, tip_masa)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Anon',1,1,1,1,'gustare') $$,
  '42501', null, 'anon NU poate insera o masa');
select throws_ok(
  $$ select purchase_token from public.google_play_subscriptions $$,
  '42501', null, 'anon NU poate citi purchase_token');
select throws_ok(
  $$ select public.sincronizeaza_gamificare_sigur() $$,
  '42501', null, 'anon NU poate invoca RPC-ul de gamificare');

-- Catalogul public ramane citibil (comportament intentionat, fara date personale)
select isnt_empty(
  $$ select 1 from public.exercises limit 1 $$,
  'anon poate citi catalogul public de exercitii');

reset role;

-- 27. Stergerea contului nu lasa entitlement activ in urma (FK ON DELETE CASCADE)
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*)::int from public.google_play_subscriptions
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0, 'stergerea contului elimina abonamentele asociate (fara entitlement orfan)');
select is(
  (select count(*)::int from public.mese
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0, 'stergerea contului elimina mesele utilizatorului');

select * from finish();
rollback;
