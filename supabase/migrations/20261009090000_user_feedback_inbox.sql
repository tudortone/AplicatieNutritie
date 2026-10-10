-- Private feedback inbox. Clients can submit through a narrowly scoped RPC but
-- cannot read or mutate the inbox; the owner uses Supabase's authenticated SQL
-- Editor/Table Editor. Backend service_role can read the inbox if later needed.
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  delivery_status text not null default 'not_configured'
    check (delivery_status in ('not_configured', 'pending', 'sent', 'failed')),
  review_status text not null default 'new'
    check (review_status in ('new', 'reviewed'))
);

create index if not exists idx_user_feedback_created_at
  on public.user_feedback (created_at desc);
create index if not exists idx_user_feedback_review_status_created_at
  on public.user_feedback (review_status, created_at desc);

alter table public.user_feedback enable row level security;

revoke all on table public.user_feedback from public, anon, authenticated;
grant select, insert, update, delete on table public.user_feedback to service_role;

create or replace function public.submit_user_feedback(p_message text)
returns table(id uuid, created_at timestamptz, delivery_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message text := btrim(p_message);
begin
  if v_user_id is null then
    raise insufficient_privilege using message = 'Authenticated user required.';
  end if;
  if v_message is null or char_length(v_message) < 1 or char_length(v_message) > 2000 then
    raise check_violation using message = 'Feedback message must be 1 to 2000 characters.';
  end if;

  return query
    insert into public.user_feedback as feedback (message, user_id)
    values (v_message, v_user_id)
    returning feedback.id, feedback.created_at, feedback.delivery_status;
end;
$$;

revoke all on function public.submit_user_feedback(text) from public, anon;
grant execute on function public.submit_user_feedback(text) to authenticated;

comment on table public.user_feedback is
  'Private feedback inbox. Regular clients cannot read or mutate submitted feedback.';
comment on column public.user_feedback.delivery_status is
  'Owner notification state; not_configured while no transactional email provider is configured.';
comment on column public.user_feedback.review_status is
  'Owner-managed inbox state: new or reviewed.';
comment on function public.submit_user_feedback(text) is
  'Authenticated insert-only RPC; returns receipt fields for the caller and never exposes other feedback.';
