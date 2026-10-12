-- ============================================================
-- game_ai_usage — exact cost of every AI call made by the games
-- (millionaire, balloons, xo, snake, sinjim) via /api/game-ai.
--
-- One row per call: who, which game, how many images, how long
-- the pasted text was, the real token counts returned by the
-- provider, and the cost in USD at the configured price.
--
-- Written only by the server with the service_role key. Admins
-- can read everything; a teacher can read her own rows.
-- New table only: touches no existing table or function.
--
-- Run once in Supabase (production) -> SQL Editor. Safe to rerun.
-- Comments in English on purpose: Arabic after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

create table if not exists public.game_ai_usage (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  game          text        not null,
  image_count   integer     not null default 0,
  text_chars    integer     not null default 0,
  input_tokens  integer     not null default 0,
  output_tokens integer     not null default 0,
  cost_usd      numeric(10,5) not null default 0,
  ok            boolean     not null default true,
  model         text,
  created_at    timestamptz not null default now()
);

create index if not exists game_ai_usage_user_idx on public.game_ai_usage(user_id, created_at desc);
create index if not exists game_ai_usage_day_idx  on public.game_ai_usage(created_at desc);

alter table public.game_ai_usage enable row level security;

drop policy if exists game_ai_usage_select on public.game_ai_usage;
create policy game_ai_usage_select on public.game_ai_usage for select
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.game_ai_usage from anon;
grant select on public.game_ai_usage to authenticated;
