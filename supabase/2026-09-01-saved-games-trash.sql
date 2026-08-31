-- Soft-delete "Trash" for saved_games (30-day retention). deleted_at NULL = active.
-- Normal lists exclude deleted; the trash view lists them; restore nulls deleted_at;
-- permanent delete is a hard DELETE (owner-scoped, trash-only); a daily Vercel Cron
-- hard-deletes rows whose deleted_at is >= 30 days old. NO separate trash table.
--
-- saved_games already has own-row RLS and authenticated UPDATE/DELETE (its save and
-- delete APIs work today), so soft-delete (UPDATE) / restore (UPDATE) / permanent
-- (DELETE) need NO policy or grant change. Idempotent. Comments in English for the
-- SQL editor.

alter table public.saved_games add column if not exists deleted_at timestamptz;

-- active lists (أعمالي + in-game libraries): only non-deleted, newest first
create index if not exists saved_games_user_active_idx
  on public.saved_games (user_id, updated_at desc) where deleted_at is null;

-- trash list per teacher: only deleted, most-recently-deleted first
create index if not exists saved_games_trash_idx
  on public.saved_games (user_id, deleted_at desc) where deleted_at is not null;

-- cron purge scan by age
create index if not exists saved_games_purge_idx
  on public.saved_games (deleted_at) where deleted_at is not null;

select 'saved_games deleted_at trash added' as migration_revision;
