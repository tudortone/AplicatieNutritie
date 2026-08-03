-- === 1. Maparea Clerk -> Supabase UUID ===
create table if not exists public.clerk_user_map (
  clerk_user_id   text primary key,
  supabase_user_id uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);
create index if not exists clerk_user_map_supabase_idx
  on public.clerk_user_map (supabase_user_id);

alter table public.clerk_user_map enable row level security;

-- === 2. Tabela de Cache Global Coduri de Bare (Creare daca nu exista) ===
create table if not exists public.barcode_cache (
  code         text primary key,
  name         text,
  brand        text,
  quantity     text,
  kcal_100g    numeric,
  protein_100g numeric,
  carbs_100g   numeric,
  fat_100g     numeric,
  source       text,
  is_system    boolean not null default false,
  created_by_user uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- Adaugare coloana is_system daca tabela exista deja fara ea
alter table public.barcode_cache
  add column if not exists is_system boolean not null default false;

update public.barcode_cache
   set is_system = true
 where source in ('openfoodfacts', 'off', 'estimare_ai');

delete from public.barcode_cache where source = 'estimare_ai';

-- === 3. Estimările AI per utilizator ===
create table if not exists public.barcode_estimari_utilizator (
  user_id      uuid not null references auth.users(id) on delete cascade,
  code         text not null,
  name         text,
  brand        text,
  quantity     text,
  kcal_100g    numeric,
  protein_100g numeric,
  carbs_100g   numeric,
  fat_100g     numeric,
  updated_at   timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.barcode_estimari_utilizator enable row level security;

drop policy if exists "estimari_proprii" on public.barcode_estimari_utilizator;
create policy "estimari_proprii"
  on public.barcode_estimari_utilizator
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
