-- ============================================================
-- AI daily usage — per-user daily cap on the Anthropic routes
-- (game-ai, ocr, gradebook-ai). BUDGET GUARD, not a product
-- quota: it bounds how many AI calls one user can trigger per
-- day so a buggy loop or malicious client cannot drain the
-- Anthropic balance.
--
-- Modeled 1:1 on quran_reserve_audio (phase10-rate): one row
-- per (user, Kuwait day, kind); RESERVE not increment-then-judge
-- (a rejected request writes NOTHING); atomic under concurrency
-- via FOR UPDATE; the caller FAILS CLOSED (no reserve => no AI).
--
-- Two entry points, because the routes differ:
--   * ai_reserve_daily(kind, limit)          — session routes
--       (game-ai, ocr). Uses auth.uid() inside SECURITY DEFINER,
--       called with the user's own JWT. Granted to authenticated.
--   * ai_reserve_daily_for(user, kind, limit) — no-session route
--       (gradebook-ai) called cross-origin with an HMAC-signed
--       token whose uid we trust. Called via service_role only,
--       so a normal user can never spoof another user's counter.
--
-- Kinds: 'game' | 'ocr' | 'gradebook'. Limits come from the
-- server (env-tunable); the SQL only enforces what it is told,
-- with a sanity floor.
--
-- Comments in English on purpose: Arabic after "--" breaks text
-- direction inside the Supabase SQL editor.
-- ============================================================

create table if not exists public.ai_daily_usage (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  -- Kuwait day (UTC+3, no DST): the cap resets at local midnight.
  day_key       date        not null,
  kind          text        not null check (kind in ('game','ocr','gradebook')),
  request_count integer     not null default 0 check (request_count >= 0),
  updated_at    timestamptz not null default now(),
  primary key (user_id, day_key, kind)
);

alter table public.ai_daily_usage enable row level security;

-- Owner may read her own usage. Nobody writes directly — the
-- reserve functions below are the only writers.
drop policy if exists "ai daily usage read own" on public.ai_daily_usage;
create policy "ai daily usage read own"
  on public.ai_daily_usage for select
  using (auth.uid() = user_id);

-- ── Shared core: reserve one unit for (v_user, kind) ─────────
-- Locks the row, compares against p_limit, and either writes +1
-- (allowed) or nothing (rejected). Returns a jsonb verdict.
create or replace function public._ai_reserve_core(
  p_user  uuid,
  p_kind  text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := ((now() at time zone 'utc') + interval '3 hours')::date;
  v_cnt integer;
begin
  if p_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_kind is null or p_kind not in ('game','ocr','gradebook')
     or coalesce(p_limit, 0) < 1 then
    raise exception 'BAD_RESERVE_ARGS';
  end if;

  -- Ensure the row exists, then lock it. Racing requests
  -- serialize here; the loser sees the winner's usage.
  insert into public.ai_daily_usage (user_id, day_key, kind)
  values (p_user, v_day, p_kind)
  on conflict (user_id, day_key, kind) do nothing;

  select request_count into v_cnt
    from public.ai_daily_usage
   where user_id = p_user and day_key = v_day and kind = p_kind
   for update;

  if v_cnt + 1 > p_limit then
    -- Rejected: write nothing. The counter never grows on refusal.
    return jsonb_build_object(
      'allowed', false, 'used', v_cnt,
      'remaining', greatest(0, p_limit - v_cnt), 'limit', p_limit);
  end if;

  update public.ai_daily_usage
     set request_count = v_cnt + 1, updated_at = now()
   where user_id = p_user and day_key = v_day and kind = p_kind;

  return jsonb_build_object(
    'allowed', true, 'used', v_cnt + 1,
    'remaining', greatest(0, p_limit - v_cnt - 1), 'limit', p_limit);
end;
$$;

-- The core is an internal helper: no direct caller access.
revoke execute on function public._ai_reserve_core(uuid, text, integer) from public, anon, authenticated;

-- ── Session entry point (game-ai, ocr) ──────────────────────
-- auth.uid() is the authenticated user. A signed-in user calling
-- this directly can only ADD to her own counter (self-harm).
create or replace function public.ai_reserve_daily(
  p_kind  text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._ai_reserve_core(auth.uid(), p_kind, p_limit);
end;
$$;

revoke execute on function public.ai_reserve_daily(text, integer) from public, anon;
grant  execute on function public.ai_reserve_daily(text, integer) to authenticated;

-- ── Explicit-user entry point (gradebook-ai, service_role) ───
-- The route verifies an HMAC-signed token and passes its uid.
-- service_role only — never authenticated/anon — so a user
-- cannot pass someone else's id.
create or replace function public.ai_reserve_daily_for(
  p_user  uuid,
  p_kind  text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._ai_reserve_core(p_user, p_kind, p_limit);
end;
$$;

revoke execute on function public.ai_reserve_daily_for(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.ai_reserve_daily_for(uuid, text, integer) to service_role;
