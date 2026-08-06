-- ============================================================
-- ai_jobs: coada de lucru asincron pentru task-urile Trigger.dev
-- (ex. analiza-mancare-ai). Backendul scrie prin client admin
-- (service_role); utilizatorul vede DOAR propriile job-uri (select RLS).
-- ============================================================
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger_run_id text unique,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security: utilizatorul vede doar propriile job-uri.
-- Scrierea (insert/update/delete) ramane rezervata backendului
-- prin service_role, neaccesibila direct clientului (anon/authenticated).
-- ============================================================
alter table public.ai_jobs enable row level security;

create policy "Users read their own AI jobs"
  on public.ai_jobs
  for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.ai_jobs from anon, authenticated;

-- ============================================================
-- Realtime pentru monitorizarea progresului job-urilor in aplicatie.
-- ============================================================
alter publication supabase_realtime add table public.ai_jobs;