-- Phase 4 - My Garden
--
-- WHY THESE TABLES DO NOT LOOK LIKE THE OTHERS
--   Every other table in this section grants the learner "for all" on her own
--   rows. That is right for a preference or an attempt log: the worst case is
--   that she lies to herself about her own practice.
--
--   The garden is different. It is the reward surface. If the browser can
--   write to it, then one line in a developer console grows a full tree, and
--   every plant in the garden stops meaning anything. So these tables grant
--   SELECT only. There is deliberately no insert, update, or delete policy
--   for the learner -- not a restrictive one, none at all.
--
--   Writes happen exclusively in server routes using the service role, after
--   the server itself has judged the recitation. The browser reports nothing;
--   it only reads what the server decided.
--
-- WHY NOT READ quran_event
--   quran_event is written directly from the browser (features/quran/data/
--   practice.ts is a client module, and its policy allows insert). It is fine
--   as a personal activity trail. It is not evidence, and the garden must not
--   grow from it.
--
-- WHAT IS NOT HERE
--   No audio. No pronunciation score. No tajweed. No ranking, no leaderboard,
--   no other learner's name. The garden is a private experience.
--
-- SAFE TO RUN TWICE.

-- ── 1. The garden ──────────────────────────────────────────
create table if not exists public.quran_garden (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ── 2. Plants ──────────────────────────────────────────────
create table if not exists public.quran_garden_plant (
  id            bigserial   primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  plant_type    text        not null
                  check (plant_type in ('sunflower','tulip','rose','herb','tree')),

  -- Where it sits in the garden. Chosen by the learner when planting.
  slot          smallint    not null check (slot >= 0 and slot < 12),

  -- Internal progress. The learner never sees this number, only her plant.
  drops_used    smallint    not null default 0 check (drops_used >= 0),

  planted_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- One growing plant at a time. Finish what you started, then choose again.
-- This is also the answer to "can I switch seeds": no, not until it completes.
-- Documented in docs/quran-status.md.
create unique index if not exists quran_garden_one_growing
  on public.quran_garden_plant (user_id) where completed_at is null;

-- A slot holds one plant forever. Completed plants stay in the garden --
-- that is the whole point of a permanent garden.
create unique index if not exists quran_garden_slot_taken
  on public.quran_garden_plant (user_id, slot);

-- ── 3. Water drops ─────────────────────────────────────────
-- One row per earned drop. used_at null means it is still in her hand.
create table if not exists public.quran_garden_drop (
  id           bigserial   primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,

  reason       text        not null
                 check (reason in ('recitation_completed','recitation_without_help',
                                   'passage_mastered','weak_spot_improved',
                                   'review_completed')),

  -- What produced it, so an award can never be granted twice for one act.
  source_kind  text        not null check (source_kind in ('recitation','review')),
  source_id    bigint,

  -- 'surah:from-to'. Used by the anti-grinding rule below.
  segment_key  text        not null,
  day_key      date        not null default (now() at time zone 'utc')::date,

  earned_at    timestamptz not null default now(),
  used_at      timestamptz,
  plant_id     bigint      references public.quran_garden_plant(id) on delete set null
);

-- THE ANTI-GRINDING RULE.
--   The same passage, on the same day, for the same reason, earns once.
--   Reciting al-Fatiha twenty times before bed is one drop, not twenty.
--   This is what keeps the garden from rewarding volume, which was an
--   explicit requirement: a child memorising short surahs must not feel
--   her progress is worth less than someone reciting long passages.
create unique index if not exists quran_garden_drop_once
  on public.quran_garden_drop (user_id, reason, segment_key, day_key);

create index if not exists quran_garden_drop_held
  on public.quran_garden_drop (user_id, used_at) where used_at is null;

-- ── 4. Cosmetic rewards: deliberately NOT a table ──────────
--   Rewards are a pure function of two facts we already store: how many
--   plants were completed, and how many distinct days were watered. So they
--   are computed at read time, never written.
--
--   That is not a shortcut, it is the safer design. A rewards table is a row
--   someone would want to forge -- "unlock the fountain" -- and the safest
--   row is the one that does not exist. Thresholds live in one place,
--   garden/tuning.ts, and cannot drift between code and database.

-- ── 5. Row level security ──────────────────────────────────
-- SELECT only, own rows. No write policy exists on purpose: see the header.
alter table public.quran_garden        enable row level security;
alter table public.quran_garden_plant  enable row level security;
alter table public.quran_garden_drop   enable row level security;

drop policy if exists "garden read own"        on public.quran_garden;
drop policy if exists "garden plant read own"  on public.quran_garden_plant;
drop policy if exists "garden drop read own"   on public.quran_garden_drop;

create policy "garden read own"        on public.quran_garden        for select using (auth.uid() = user_id);
create policy "garden plant read own"  on public.quran_garden_plant  for select using (auth.uid() = user_id);
create policy "garden drop read own"   on public.quran_garden_drop   for select using (auth.uid() = user_id);

-- ── 6. Write paths ─────────────────────────────────────────
-- The tables above grant SELECT only, so nothing can be written directly.
-- These two functions are the only doors, and they are security definer.
--
-- WHY THESE TWO ARE SAFE TO EXPOSE TO THE LEARNER
--   Neither creates progress out of nothing.
--   * garden_plant only places a seed. Planting earns nothing.
--   * garden_water only SPENDS a drop that already exists. If the server
--     never granted a drop, watering does nothing at all.
--   So the worst a forged call can do is plant a seed the learner is
--   entitled to plant, or spend water she already earned.
--
--   Granting drops is the one act that creates progress, and it is
--   deliberately NOT here. It happens only in the server route that judged
--   the recitation, using a key the browser does not have.

create or replace function public.garden_plant(p_type text, p_slot smallint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   bigint;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.quran_garden (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  -- Enforced by quran_garden_one_growing: finish what you started.
  if exists (
    select 1 from public.quran_garden_plant
    where user_id = v_user and completed_at is null
  ) then
    raise exception 'ALREADY_GROWING';
  end if;

  if exists (
    select 1 from public.quran_garden_plant
    where user_id = v_user and slot = p_slot
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  insert into public.quran_garden_plant (user_id, plant_type, slot)
  values (v_user, p_type, p_slot)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.garden_water()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Kept in step with DROPS_TO_COMPLETE in garden/tuning.ts.
  -- A test reads this file and fails if the two ever drift apart.
  c_complete constant smallint := 18;

  v_user     uuid := auth.uid();
  v_plant    public.quran_garden_plant%rowtype;
  v_drop_id  bigint;
  v_used     smallint;
  v_done     boolean := false;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_plant
  from public.quran_garden_plant
  where user_id = v_user and completed_at is null
  limit 1;

  if not found then
    raise exception 'NO_PLANT';
  end if;

  -- Oldest drop first, so the reason shown is the one earned longest ago.
  select id into v_drop_id
  from public.quran_garden_drop
  where user_id = v_user and used_at is null
  order by earned_at asc
  limit 1
  for update;

  if v_drop_id is null then
    raise exception 'NO_WATER';
  end if;

  update public.quran_garden_drop
  set used_at = now(), plant_id = v_plant.id
  where id = v_drop_id;

  update public.quran_garden_plant
  set drops_used = drops_used + 1
  where id = v_plant.id
  returning drops_used into v_used;

  if v_used >= c_complete then
    update public.quran_garden_plant
    set completed_at = now()
    where id = v_plant.id and completed_at is null;
    v_done := true;
  end if;

  return jsonb_build_object('plantId', v_plant.id, 'dropsUsed', v_used, 'completed', v_done);
end;
$$;

revoke execute on function public.garden_plant(text, smallint) from public, anon;
revoke execute on function public.garden_water()               from public, anon;
grant  execute on function public.garden_plant(text, smallint) to authenticated;
grant  execute on function public.garden_water()               to authenticated;
