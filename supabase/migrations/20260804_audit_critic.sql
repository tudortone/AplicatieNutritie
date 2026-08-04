-- ==============================================================================
-- NUTRIAI — MIGRARE AUDIT CRITIC, 2026-08
--
-- Idempotentă: poate fi rulată de mai multe ori fără efecte secundare.
-- Rulare: SQL Editor din dashboard-ul Supabase, SAU `supabase db push`.
--
-- Presupune că `supabase_rls_policies.sql` și `supabase_patch_critic.sql` au fost
-- deja aplicate (tabelele `barcode_cache`, `barcode_estimari_utilizator`,
-- `clerk_user_map`, `mese` există, cu RLS activ).
-- ==============================================================================


-- ==============================================================================
-- 1. [S-3 / CRITIC] TOCTOU la salvarea produselor scanate
--
-- Codul face, în două apeluri separate:
--     verificaDreptDeScriere()  -> SELECT created_by_user, is_system
--     salveazaProdusManual()    -> UPSERT
--
-- Între cele două există o fereastră de timp real. Două cereri concurente pe
-- același cod de bare trec ambele prin SELECT (nu găsesc nimic, deci "permis"),
-- apoi ambele scriu — a doua suprascrie datele primei și îi fură proprietatea.
-- Nicio verificare făcută în aplicație nu poate închide această fereastră; doar
-- baza de date poate, pentru că doar ea poate bloca rândul.
--
-- Soluție: o singură instrucțiune. Predicatul de proprietate devine parte din
-- `ON CONFLICT DO UPDATE ... WHERE`, evaluat de Postgres sub blocarea rândului.
-- Dacă predicatul e fals, nu se actualizează nimic și `row_count` rămâne 0.
-- ==============================================================================

create or replace function public.salveaza_produs_barcode_sigur(
  p_code     text,
  p_user_id  uuid,
  p_name     text,
  p_brand    text,
  p_quantity text,
  p_kcal     numeric,
  p_protein  numeric,
  p_carbs    numeric,
  p_fat      numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows       integer;
  v_is_system  boolean;
  v_owner      uuid;
begin
  if p_code is null or p_code !~ '^[0-9]{4,20}$' then
    return 'cod_invalid';
  end if;

  if p_user_id is null then
    return 'refuzat';
  end if;

  insert into public.barcode_cache (
    code, source, is_system, created_by_user,
    name, brand, quantity,
    kcal_100g, protein_100g, carbs_100g, fat_100g,
    payload, updated_at
  )
  values (
    p_code, 'user_manual', false, p_user_id,
    p_name, p_brand, p_quantity,
    p_kcal, p_protein, p_carbs, p_fat,
    jsonb_build_object('userInputs', true), now()
  )
  on conflict (code) do update
     set name         = excluded.name,
         brand        = excluded.brand,
         quantity     = excluded.quantity,
         kcal_100g    = excluded.kcal_100g,
         protein_100g = excluded.protein_100g,
         carbs_100g   = excluded.carbs_100g,
         fat_100g     = excluded.fat_100g,
         payload      = excluded.payload,
         updated_at   = now()
   -- Intrările de sistem (OpenFoodFacts) sunt intangibile.
   -- Intrările manuale fără proprietar sunt moștenire dinaintea migrării și sunt
   -- tratate tot ca intangibile — altfel gaura rămâne deschisă pentru datele vechi.
   where public.barcode_cache.is_system = false
     and public.barcode_cache.created_by_user is not null
     and public.barcode_cache.created_by_user = p_user_id;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return 'salvat';
  end if;

  -- Nu s-a scris nimic: aflăm de ce, ca aplicația să poată da un mesaj util.
  select is_system, created_by_user
    into v_is_system, v_owner
    from public.barcode_cache
   where code = p_code;

  if v_is_system then
    return 'produs_de_sistem';
  end if;

  if v_owner is null then
    return 'fara_proprietar';
  end if;

  return 'alt_proprietar';
end;
$$;

-- Funcția primește `p_user_id` ca argument și rulează cu SECURITY DEFINER, deci un
-- client autentificat care ar putea-o apela ar putea trimite UUID-ul altcuiva.
-- De aceea execuția este permisă EXCLUSIV backendului (`service_role`).
revoke all on function public.salveaza_produs_barcode_sigur(
  text, uuid, text, text, text, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.salveaza_produs_barcode_sigur(
  text, uuid, text, text, text, numeric, numeric, numeric, numeric
) to service_role;


-- ==============================================================================
-- 2. Constrângeri de integritate pe cache-ul de coduri de bare
--
-- Valorile nutriționale ajung în jurnalul caloric al utilizatorilor. Dacă o
-- valoare absurdă poate fi scrisă, va fi scrisă — fie de un bug, fie de un
-- model care halucinează. Limita trebuie să fie în baza de date, nu în cod.
-- ==============================================================================

alter table public.barcode_cache drop constraint if exists barcode_cache_kcal_check;
alter table public.barcode_cache add constraint barcode_cache_kcal_check
  check (kcal_100g is null or (kcal_100g >= 0 and kcal_100g <= 1000));

alter table public.barcode_cache drop constraint if exists barcode_cache_macro_check;
alter table public.barcode_cache add constraint barcode_cache_macro_check
  check (
    (protein_100g is null or (protein_100g >= 0 and protein_100g <= 100)) and
    (carbs_100g   is null or (carbs_100g   >= 0 and carbs_100g   <= 100)) and
    (fat_100g     is null or (fat_100g     >= 0 and fat_100g     <= 100))
  );

alter table public.barcode_cache drop constraint if exists barcode_cache_code_format_check;
alter table public.barcode_cache add constraint barcode_cache_code_format_check
  check (code ~ '^[0-9]{4,20}$');

-- Aceleași limite pe estimările per utilizator.
alter table public.barcode_estimari_utilizator
  drop constraint if exists barcode_estimari_kcal_check;
alter table public.barcode_estimari_utilizator
  add constraint barcode_estimari_kcal_check
  check (kcal_100g is null or (kcal_100g >= 0 and kcal_100g <= 1000));


-- ==============================================================================
-- 3. [S-1] `clerk_user_map` — confirmare că este inaccesibilă direct
--
-- Tabela are RLS activ și NICIO politică. În Postgres, RLS activ fără politici
-- înseamnă deny-all pentru rolurile normale, deci comportamentul e deja corect.
-- Reafirmăm explicit, ca o rulare viitoare să nu o lase descoperită din greșeală.
-- ==============================================================================

alter table public.clerk_user_map enable row level security;
drop policy if exists "clerk_map_backend_only" on public.clerk_user_map;
create policy "clerk_map_backend_only" on public.clerk_user_map
  for all
  using (false)
  with check (false);


-- ==============================================================================
-- 4. [S-1] Verificare: care tabele au RLS activ dar NICIO politică de acces
--    pentru utilizatori, și care nu au RLS deloc.
--
-- Nu modifică nimic. Rulează această interogare după migrare: orice tabelă cu
-- `rls_activ = false` este citibilă de oricine are cheia anonă — iar cheia anonă
-- este în aplicația mobilă, deci este publică prin definiție.
-- ==============================================================================

-- select c.relname as tabela,
--        c.relrowsecurity as rls_activ,
--        count(p.polname) as numar_politici
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   left join pg_policy p on p.polrelid = c.oid
--  where n.nspname = 'public' and c.relkind = 'r'
--  group by 1, 2
--  order by c.relrowsecurity asc, 3 asc;
