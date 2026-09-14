-- Cloud save for «سجلات رئيس الشعبة» (department-head records tool).
-- ONE JSON snapshot row per head-of-department. The static tool never holds a
-- key: the browser calls /api/head-records/state with the session cookie, the
-- server route (createServerSupabase) acts as the user, and RLS below scopes
-- every read/write to user_id = auth.uid() so no one can touch another user's
-- snapshot. Access to the tool itself stays gated by profiles.head_records_until
-- in the route guard — this table is storage only, never an authorization source.
-- Idempotent: safe to re-run. Comments in English for SQL-editor direction.

create table if not exists public.head_records_state (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.head_records_state enable row level security;

-- owner-only: she reads, seeds and updates only her own snapshot.
drop policy if exists head_records_state_select on public.head_records_state;
create policy head_records_state_select on public.head_records_state
  for select using (user_id = auth.uid());

drop policy if exists head_records_state_insert on public.head_records_state;
create policy head_records_state_insert on public.head_records_state
  for insert with check (user_id = auth.uid());

drop policy if exists head_records_state_update on public.head_records_state;
create policy head_records_state_update on public.head_records_state
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- no anon; no delete from the client (a snapshot is upserted, never dropped here).
revoke all on public.head_records_state from anon;
revoke delete on public.head_records_state from authenticated;
grant select, insert, update on public.head_records_state to authenticated;

select 'head_records_state table created' as migration_revision;
