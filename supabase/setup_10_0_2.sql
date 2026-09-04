-- 3113ADVENTURE Sprint 10.0.2
-- Run once in Supabase SQL Editor.

create table if not exists public.user_sync_chunks (
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, chunk_key)
);

alter table public.user_sync_chunks enable row level security;

drop policy if exists "Users read own sync chunks" on public.user_sync_chunks;
create policy "Users read own sync chunks"
on public.user_sync_chunks
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own sync chunks" on public.user_sync_chunks;
create policy "Users insert own sync chunks"
on public.user_sync_chunks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own sync chunks" on public.user_sync_chunks;
create policy "Users update own sync chunks"
on public.user_sync_chunks
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own sync chunks" on public.user_sync_chunks;
create policy "Users delete own sync chunks"
on public.user_sync_chunks
for delete
to authenticated
using ((select auth.uid()) = user_id);
