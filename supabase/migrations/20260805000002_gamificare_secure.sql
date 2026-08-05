-- ==============================================================================
-- NUTRIAI — SECURIZARE GAMIFICARE (P2.8, audit 2026-08)
--
-- Inainte, politica "Users can manage their own gamification" (FOR ALL) lasa
-- cheia anona (publica prin definitie, fiind in aplicatia mobila) sa faca upsert
-- pe randul propriu de gamificare: oricine putea sa isi seteze xp_total/nivel/
-- streak direct, fara niciun efort — trisu banal.
--
-- Acum:
--   * citirea ramane permisa (SELECT pe randul propriu — folosita de refreshGamificare),
--   * scrierea e posibila DOAR prin backend (service_role) pe POST /api/gamificare,
--     care valideaza valorile si recalculeaza nivelul din XP (nu-l accepta de la client).
--
-- Idempotenta: se poate rula de mai multe ori fara efecte secundare.
-- Rulare: SQL Editor din dashboard-ul Supabase, SAU `supabase db push`.
-- ==============================================================================

alter table public.gamificare enable row level security;

drop policy if exists "Users can manage their own gamification" on public.gamificare;
drop policy if exists "Users can read their own gamification" on public.gamificare;

create policy "Users can read their own gamification"
  on public.gamificare
  for select
  using (auth.uid() = user_id);

-- Verificare rapida (nu modifica nimic): tabele cu RLS activ si numarul de politici.
--   select c.relname as tabela,
--          c.relrowsecurity as rls_activ,
--          count(p.polname) as numar_politici
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     left join pg_policy p on p.polrelid = c.oid
--    where n.nspname = 'public' and c.relkind = 'r'
--      and c.relname = 'gamificare'
--    group by 1, 2
--    order by 1;
