-- 3113ADVENTURE Sprint 10.0
-- In Supabase: SQL Editor -> New query -> paste/run this file.

create table if not exists public.user_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_snapshots enable row level security;

drop policy if exists "Users read own snapshot" on public.user_snapshots;
create policy "Users read own snapshot"
on public.user_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own snapshot" on public.user_snapshots;
create policy "Users insert own snapshot"
on public.user_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own snapshot" on public.user_snapshots;
create policy "Users update own snapshot"
on public.user_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
