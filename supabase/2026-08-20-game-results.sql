-- Minimal server-side game results (teacher-owned, no student accounts).
-- Teachers save each play's score under their own user id + a free-text
-- student name. RLS scopes every row to teacher_user_id = auth.uid().
-- Idempotent per (teacher_user_id, client_key) so a re-submitted
-- completion never duplicates. No lesson/subject/grade columns (no real
-- source for them today). Comments in English for SQL-editor direction.

create table if not exists public.game_results (
  id               uuid primary key default gen_random_uuid(),
  teacher_user_id  uuid not null references public.profiles(id) on delete cascade,
  saved_game_id    uuid references public.saved_games(id) on delete set null,
  game_type        text not null check (game_type in
                     ('millionaire','snake','xo','sinjim','balloons')),
  student_name     text not null check (btrim(student_name) <> ''),
  score            integer not null check (score >= 0),
  total            integer not null check (total > 0),
  percentage       integer not null check (percentage between 0 and 100),
  completed        boolean not null default true,
  client_key       text not null check (btrim(client_key) <> ''),
  created_at       timestamptz not null default now(),
  check (score <= total),
  unique (teacher_user_id, client_key)
);

create index if not exists game_results_teacher_idx
  on public.game_results (teacher_user_id, created_at desc);

alter table public.game_results enable row level security;

-- teacher sees and writes only her own results; never another teacher's.
drop policy if exists game_results_select on public.game_results;
create policy game_results_select on public.game_results
  for select using (teacher_user_id = auth.uid());

drop policy if exists game_results_insert on public.game_results;
create policy game_results_insert on public.game_results
  for insert with check (teacher_user_id = auth.uid());

-- no PUBLIC/anon; no update/delete from clients (results are a log).
revoke all on public.game_results from anon;
revoke update, delete on public.game_results from authenticated;
grant select, insert on public.game_results to authenticated;

select 'game_results table created' as migration_revision;
