-- ============================================================
-- Phase 10 — persistent daily audio usage + atomic reserve
--
-- Money guard for Azure speech. The cost follows AUDIO SECONDS,
-- not clip count, so seconds are the primary limit and request
-- count is only a secondary fence.
--
-- Design (approved):
--   * One row per (user, Kuwait day). No IP, no audio, no
--     transcript — user id, day, two counters, a timestamp.
--   * RESERVE, not increment-then-judge: a rejected request
--     writes NOTHING, so refusals never inflate the counter.
--   * Atomic under concurrency: row lock (FOR UPDATE) makes two
--     racing requests queue; the second sees the first's usage.
--   * FAIL CLOSED at the caller: if this function is unreachable,
--     the server must NOT call Azure.
--
-- Identity: same proven pattern as garden_water() — the API route
-- calls with the STUDENT's own JWT (anon key + session cookie,
-- never service_role), so auth.uid() inside SECURITY DEFINER is
-- the authenticated student. anon/public cannot execute at all.
-- A signed-in user calling the RPC directly can only ADD to her
-- own counter (self-harm); she can never lower it, never touch
-- another user, and the real limits are enforced server-side at
-- call time.
--
-- Comments in English on purpose: Arabic after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

create table if not exists public.quran_daily_usage (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  -- Kuwait day (UTC+3, no DST) — the daily cap resets at the
  -- child's midnight, not 3am.
  day_key       date        not null,
  audio_seconds integer     not null default 0 check (audio_seconds >= 0),
  request_count integer     not null default 0 check (request_count >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, day_key)
);

alter table public.quran_daily_usage enable row level security;

-- Owner may read her own usage (a future "so much recitation today"
-- note). Nobody writes directly — no insert/update/delete policy
-- exists at all; the reserve function below is the only writer.
drop policy if exists "daily usage read own" on public.quran_daily_usage;
create policy "daily usage read own"
  on public.quran_daily_usage for select
  using (auth.uid() = user_id);

-- ── Atomic reserve ──────────────────────────────────────────
create or replace function public.quran_reserve_audio(
  p_seconds        integer,
  p_seconds_limit  integer,
  p_requests_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day  date := ((now() at time zone 'utc') + interval '3 hours')::date;
  v_sec  integer;
  v_cnt  integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Defense in depth even against a buggy caller: one clip is
  -- 1..31 seconds, and limits must be sane positives.
  if p_seconds is null or p_seconds < 1 or p_seconds > 31
     or coalesce(p_seconds_limit, 0)  < 1
     or coalesce(p_requests_limit, 0) < 1 then
    raise exception 'BAD_RESERVE_ARGS';
  end if;

  -- Ensure the row exists, then lock it. Two racing requests
  -- serialize here; the loser sees the winner's usage.
  insert into public.quran_daily_usage (user_id, day_key)
  values (v_user, v_day)
  on conflict (user_id, day_key) do nothing;

  select audio_seconds, request_count
    into v_sec, v_cnt
    from public.quran_daily_usage
   where user_id = v_user and day_key = v_day
   for update;

  if v_sec + p_seconds > p_seconds_limit then
    -- Rejected: write nothing. The counter never grows on refusal.
    return jsonb_build_object(
      'allowed', false, 'scope', 'seconds',
      'used', v_sec, 'remaining', greatest(0, p_seconds_limit - v_sec));
  end if;

  if v_cnt + 1 > p_requests_limit then
    return jsonb_build_object(
      'allowed', false, 'scope', 'requests',
      'used', v_sec, 'remaining', greatest(0, p_seconds_limit - v_sec));
  end if;

  update public.quran_daily_usage
     set audio_seconds = v_sec + p_seconds,
         request_count = v_cnt + 1,
         updated_at    = now()
   where user_id = v_user and day_key = v_day;

  return jsonb_build_object(
    'allowed', true, 'scope', null,
    'used', v_sec + p_seconds,
    'remaining', greatest(0, p_seconds_limit - v_sec - p_seconds));
end;
$$;

-- Explicit grants — never rely on defaults.
revoke execute on function public.quran_reserve_audio(integer, integer, integer) from public, anon;
grant  execute on function public.quran_reserve_audio(integer, integer, integer) to authenticated;
