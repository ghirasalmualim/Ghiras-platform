-- User-curated "My Space" shortcuts (مساحتي). Each row is ONE pin a teacher
-- chose to add: a general tool or a curriculum subject. This table is a
-- favorites/shortcut hub ONLY — it NEVER authorizes access. Real access is
-- always re-derived live from profiles.*_until / sub_end / can_access_subject.
-- label_cache/context_cache are for display only and must never be trusted for
-- authorization. RLS scopes every row to teacher_user_id = auth.uid().
-- Idempotent per (teacher_user_id, item_type, item_key) so re-adding the same
-- shortcut never duplicates. Comments in English for SQL-editor direction.

create table if not exists public.workspace_items (
  id               uuid primary key default gen_random_uuid(),
  teacher_user_id  uuid not null references public.profiles(id) on delete cascade,
  item_type        text not null check (item_type in ('tool','subject')),
  item_key         text not null check (btrim(item_key) <> ''),
  label_cache      text,
  context_cache    text,
  created_at       timestamptz not null default now(),
  unique (teacher_user_id, item_type, item_key)
);

create index if not exists workspace_items_teacher_idx
  on public.workspace_items (teacher_user_id, created_at desc);

alter table public.workspace_items enable row level security;

-- teacher sees, adds and removes only her own pins; never another teacher's.
drop policy if exists workspace_items_select on public.workspace_items;
create policy workspace_items_select on public.workspace_items
  for select using (teacher_user_id = auth.uid());

drop policy if exists workspace_items_insert on public.workspace_items;
create policy workspace_items_insert on public.workspace_items
  for insert with check (teacher_user_id = auth.uid());

drop policy if exists workspace_items_delete on public.workspace_items;
create policy workspace_items_delete on public.workspace_items
  for delete using (teacher_user_id = auth.uid());

-- no PUBLIC/anon; no client UPDATE (a pin is add-or-remove only).
revoke all on public.workspace_items from anon;
revoke update on public.workspace_items from authenticated;
grant select, insert, delete on public.workspace_items to authenticated;

select 'workspace_items table created' as migration_revision;
